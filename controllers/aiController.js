const Inventory = require('../models/Inventory');
const DrugUsageRate = require('../models/DrugUsageRate');

// สูตรคำนวณระยะทางระหว่างพิกัด GPS 2 จุด (Haversine Formula) คืนค่าเป็นกิโลเมตร
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // รัศมีของโลก (กิโลเมตร)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
};

// =========================================================================
// @desc    ดึงรายการยาที่เสี่ยงหมดอายุภายใน 90 วัน พร้อม AI Match จับคู่ รพ. ที่ความต้องการสูง
// @route   GET /api/ai/expiry-redistribution
// =========================================================================
const getExpiryRedistribution = async (req, res) => {
    try {
        // 1. ตั้งเกณฑ์เวลา: ค้นหาล็อตยาที่จะหมดอายุภายใน 90 วันนับจากวันนี้
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 90);

        // 2. ดึงข้อมูล Inventory ทั้งหมดที่มีล๊อตย่อยใกล้หมดอายุ และยังมีของเหลืออยู่จริง
        const activeInventories = await Inventory.find({
            "lots.expiry_date": { $lte: targetDate },
            "lots.quantity_in_lot": { $gt: 0 }
        })
        .populate('hospital_ref')
        .populate('drug_ref');

        const aiRecommendations = [];

        // 3. วนลูปเพื่อนำแต่ละคลังสินค้าที่ "เสี่ยงยาหมดอายุ" มาทำ AI Matching Logic ด้วย GPS & Demand
        for (const item of activeInventories) {
            const sourceHospital = item.hospital_ref;
            const targetDrug = item.drug_ref;

            const sourceLong = sourceHospital.location.coordinates[0];
            const sourceLat = sourceHospital.location.coordinates[1];

            // กรองหาเฉพาะตัวล็อตย่อยที่ใกล้หมดอายุจริง ๆ ใน Inventory แถวนั้น
            const expiringLots = item.lots.filter(lot => lot.expiry_date <= targetDate && lot.quantity_in_lot > 0);
            
            for (const lot of expiringLots) {
                const quantityToMove = lot.quantity_in_lot;

                // 🧠 [AI Matching Logic] 
                // ค้นหา "โรงพยาบาลปลายทาง" ที่ควรรับยานี้ไปใช้ต่อ โดยอิงจากสถิติอัตราใช้ยา (DrugUsageRate)
                // เงื่อนไข: ต้องไม่ใช่โรงพยาบาลเดิมที่เป็นเจ้าของยา และต้องเป็นยาตัวเดียวกัน
                const potentialRecipients = await DrugUsageRate.find({
                    drug_ref: targetDrug._id,
                    hospital_ref: { $ne: sourceHospital._id } // ห้ามส่งให้ตัวเอง
                })
                .populate('hospital_ref');

                // นำผู้รับที่มีแนวโน้มมาคำนวณคะแนน GPS ระยะทาง และสัดส่วน Demand ความต้องการจ่ายยา
                const suggestions = potentialRecipients.map(recipient => {
                    const recipientHospital = recipient.hospital_ref;
                    const recipientLong = recipientHospital.location.coordinates[0];
                    const recipientLat = recipientHospital.location.coordinates[1];

                    // คำนวณระยะทางจริงเชิงพิกัด (กิโลเมตร)
                    const distance = calculateDistance(sourceLat, sourceLong, recipientLat, recipientLong);

                    // 1. คะแนนความต้องการ (Demand Score): ยิ่งมีอัตราใช้ยาเฉลี่ยต่อเดือนสูง ยิ่งเคลียร์ยาได้ทัน (เต็ม 50 คะแนน)
                    // ตัวอย่างสูตร: ยอดเบิกจ่ายเฉลี่ยต่อเดือนของ รพ. ปลายทาง หารด้วยเกณฑ์ความเหมาะสม
                    const demandScore = Math.min(50, recipient.average_monthly_usage * 0.25);

                    // 2. คะแนนระยะทาง (Distance Score): ยิ่งอยู่ใกล้กันยิ่งกระจายง่าย ขนส่งสะดวก (เต็ม 50 คะแนน)
                    const distanceScore = Math.max(0, 50 - (distance * 0.8));

                    // 3. คะแนนโซนเครือข่ายโบนัส: ถ้าอยู่กลุ่มรหัสโซนพื้นที่เดียวกัน (เช่น UD-EAST เหมือนกัน)
                    const isSameZone = sourceHospital.network_group_id === recipientHospital.network_group_id;
                    let totalScore = demandScore + distanceScore;
                    if (isSameZone) totalScore += 10; // มอบคะแนนพิเศษให้โรงพยาบาลในเครือย่อยเดียวกัน

                    // แปลงคะแนนรวมให้อยู่ในรูป Confidence Score ค่า 0.0 - 1.0 (ตามสเปก)
                    const confidenceScore = parseFloat(Math.min(1.0, totalScore / 100).toFixed(2));

                    return {
                        to_hospital_id: recipientHospital._id,
                        hospital_name: recipientHospital.hospital_name,
                        average_monthly_usage: recipient.average_monthly_usage,
                        distance_km: parseFloat(distance.toFixed(1)),
                        confidence_score: confidenceScore,
                        reasoning: `พบ ${recipientHospital.hospital_name} มีอัตราเบิกจ่ายใช้ยาชนิดนี้สูงถึง ${recipient.average_monthly_usage} ชิ้น/เดือน อยู่ห่างออกไปเพียง ${distance.toFixed(1)} กม. ${isSameZone ? '(จัดอยู่ในพื้นที่เครือข่ายย่อยเดียวกัน)' : ''}`
                    };
                })
                // เรียงลำดับโรงพยาบาลปลายทางที่ AI มั่นใจที่สุดและเหมาะสมที่สุดขึ้นก่อน
                .sort((a, b) => b.confidence_score - a.confidence_score);

                // บันทึกและจัดฟอร์แมตฟิลด์เพื่อส่งออกไปเป็นหน้า Card สวย ๆ บนหน้าจอ Next.js
                aiRecommendations.push({
                    inventory_id: item._id,
                    drug_name: targetDrug.generic_name,
                    trade_name: targetDrug.trade_name,
                    category: targetDrug.category,
                    from_hospital: sourceHospital.hospital_name,
                    expiring_lot: {
                        lot_number: lot.lot_number,
                        expiry_date: lot.expiry_date,
                        quantity: quantityToMove
                    },
                    // AI Suggestion: เลือกหยิบเอา รพ. ที่ทำคะแนนรวม GPS + Demand ได้เป็นอันดับ 1 มาเป็นข้อเสนอแนะนำ
                    ai_suggestion: suggestions.length > 0 ? suggestions[0] : {
                        hospital_name: "ไม่พบโรงพยาบาลปลายทางในเครือข่ายที่มียอดความต้องการใช้ยานี้",
                        confidence_score: 0.0,
                        reasoning: "ไม่มีสถิติความต้องการใช้นอกคลังต้นทาง โปรดตรวจสอบระดับสต็อกในภาพรวมระบบอีกครั้ง"
                    }
                });
            }
        }

        return res.status(200).json({ 
            success: true, 
            count: aiRecommendations.length, 
            data: aiRecommendations 
        });

    } catch (error) {
        console.error('❌ AI Expiry Redistribution error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// @desc    ดึงรายการแจ้งเตือนยากลุ่มวิกฤต พร้อมคำแนะนำจาก AI (Alert Queue)
// @route   GET /api/ai/alert-queue
const getAlertQueue = async (req, res) => {
    try {
        // 1. ดึงข้อมูลคลังยาทั้งหมดในระบบขึ้นมาตรวจสอบ
        const allInventory = await Inventory.find()
            .populate('hospital_ref')
            .populate('drug_ref');

        // 2. แยกกลุ่ม: หา รพ. ที่วิกฤต (Demand) และ รพ. ที่มียาเหลือ (Supply)
        const criticalList = allInventory.filter(item => item.available_quantity <= item.safety_stock_level);
        const healthyList = allInventory.filter(item => item.available_quantity > item.safety_stock_level * 1.5);

        // 3. วนลูปสร้างคิวแจ้งเตือน และให้ AI จับคู่หา รพ. ที่ควรไปยืม
        const alertQueue = criticalList.map(criticalItem => {
            const targetHospital = criticalItem.hospital_ref;
            const targetDrug = criticalItem.drug_ref;

            const targetLong = targetHospital.location.coordinates[0];
            const targetLat = targetHospital.location.coordinates[1];

            // ค้นหาและให้คะแนน รพ. อื่นที่มียาตัวเดียวกันนี้เหลือเฟือ
            const suggestions = healthyList
                .filter(healthyItem => healthyItem.drug_ref._id.toString() === targetDrug._id.toString())
                .map(healthyItem => {
                    const donorHospital = healthyItem.hospital_ref;
                    const donorLong = donorHospital.location.coordinates[0];
                    const donorLat = donorHospital.location.coordinates[1];

                    // คำนวณระยะทางห่างกัน (กิโลเมตร)
                    const distance = calculateDistance(targetLat, targetLong, donorLat, donorLong);

                    // คำนวณคะแนนสต็อก: ยิ่งมียาเกิน safety stock มาก ยิ่งได้คะแนนสูง (เต็ม 50)
                    const stockSurplus = healthyItem.available_quantity - healthyItem.safety_stock_level;
                    const stockScore = Math.min(50, stockSurplus * 2);

                    // คำนวณคะแนนระยะทาง: ระยะ 0-50 กม. ได้คะแนนลดหลั่นกันไป (เต็ม 50)
                    const distanceScore = Math.max(0, 50 - (distance * 0.8));

                    // รวมคะแนนความมั่นใจเต็ม 100 แล้วแปลงเป็นค่า 0.0 - 1.0 (Confidence Score ตามสเปก Entity 8)
                    const confidenceScore = parseFloat(((stockScore + distanceScore) / 100).toFixed(2));

                    return {
                        donor_inventory_id: healthyItem._id,
                        hospital_name: donorHospital.hospital_name,
                        available_quantity: healthyItem.available_quantity,
                        distance_km: parseFloat(distance.toFixed(1)),
                        confidence_score: confidenceScore,
                        reasoning: `พบ ${donorHospital.hospital_name} อยู่ห่างออกไป ${distance.toFixed(1)} กม. และมีปริมาณยาสำรองพร้อมปล่อยยืมจำนวน ${healthyItem.available_quantity} หลอด/เม็ด`
                    };
                })
                // เรียงลำดับ รพ. ที่ AI แนะนำมากที่สุดขึ้นก่อน (คะแนนสูงสุด)
                .sort((a, b) => b.confidence_score - a.confidence_score);

            // ส่งข้อมูล Alert Card แต่ละใบกลับไป
            return {
                alert_id: criticalItem._id,
                drug_name: targetDrug.generic_name,
                trade_name: targetDrug.trade_name,
                category: targetDrug.category,
                hospital_in_need: targetHospital.hospital_name,
                current_stock: criticalItem.available_quantity,
                safety_level: criticalItem.safety_stock_level,
                detected_at: criticalItem.updatedAt,
                // AI Suggestion: ดึงตัวที่ได้คะแนนอันดับ 1 ไปเป็นคำแนะนำหลัก
                ai_suggestion: suggestions.length > 0 ? suggestions[0] : {
                    hospital_name: "ไม่พบโรงพยาบาลใกล้เคียงที่มีกำลังยาเพียงพอ",
                    confidence_score: 0.0,
                    reasoning: "วิกฤต: ยาขาดแคลนทั้งเครือข่ายย่อย โปรดติดต่อสสจ. ส่วนกลางเพื่อเติมเวชภัณฑ์"
                }
            };
        });

        return res.status(200).json({ success: true, count: alertQueue.length, data: alertQueue });

    } catch (error) {
        console.error('❌ AI Alert Queue error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = {
    getAlertQueue,
    getExpiryRedistribution
};