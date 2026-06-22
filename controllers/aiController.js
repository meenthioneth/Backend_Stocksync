const Inventory = require('../models/Inventory');

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
    getAlertQueue
};