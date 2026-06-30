const Inventory = require('../models/Inventory');
const DrugUsageRate = require('../models/DrugUsageRate');
const Hospital = require('../models/Hospital');

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

/**
 * เรียก Longdo Map "Calculate route" REST API เพื่อหาระยะทาง+เวลาขนส่งจริงตามถนน
 */
const calculateRealRoute = async (fromLat, fromLon, toLat, toLon) => {
    const fallback = () => {
        const distanceKm = calculateDistance(fromLat, fromLon, toLat, toLon);
        const minutes = Math.round(distanceKm * 1.0 + 10);
        return { distanceKm: parseFloat(distanceKm.toFixed(1)), minutes, isEstimate: true };
    };

    const apiKey = process.env.LONGDO_MAP_API_KEY;
    if (!apiKey) return fallback();

    try {
        const params = new URLSearchParams({
            flon: String(fromLon), 
            flat: String(fromLat),
            tlon: String(toLon), 
            tlat: String(toLat),
            mode: 't', 
            key: apiKey
        });

        if (typeof fetch !== 'function') {
            return fallback();
        }

        const response = await fetch(`https://api.longdo.com/RouteService/json/route/guide?${params}`);
        if (!response.ok) return fallback();

        const json = await response.json();
        const route = json && json.data && json.data[0];
        
        if ((json && json.meta && json.meta.status) || !route || typeof route.distance !== 'number') {
            return fallback();
        }

        return {
            distanceKm: parseFloat((route.distance / 1000).toFixed(1)),
            minutes: Math.round(route.interval / 60),
            isEstimate: false
        };
    } catch (error) {
        console.error('⚠️ Longdo Route API เรียกไม่สำเร็จ ใช้ค่าประมาณ Haversine แทน:', error.message);
        return fallback();
    }
};

// =========================================================================
// @desc    ดึงรายการยาที่เสี่ยงหมดอายุภายใน 90 วัน พร้อม AI Match จับคู่ รพ. ที่ความต้องการสูง
// =========================================================================
const getExpiryRedistribution = async (req, res) => {
    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 90);

        const activeInventories = await Inventory.find({
            "lots.expiry_date": { $lte: targetDate },
            "lots.quantity_in_lot": { $gt: 0 }
        })
        .populate('hospital_ref')
        .populate('drug_ref');

        if (!activeInventories || activeInventories.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const drugIds = [];
        for (let i = 0; i < activeInventories.length; i++) {
            if (activeInventories[i].drug_ref && activeInventories[i].drug_ref._id) {
                drugIds.push(activeInventories[i].drug_ref._id);
            }
        }
        
        const allUsageRates = await DrugUsageRate.find({ drug_ref: { $in: drugIds } })
            .populate('hospital_ref');

        const aiRecommendations = [];

        for (const item of activeInventories) {
            const sourceHospital = item.hospital_ref;
            const targetDrug = item.drug_ref;

            if (!sourceHospital || !targetDrug) continue;

            const sourceLong = sourceHospital.location.coordinates[0];
            const sourceLat = sourceHospital.location.coordinates[1];
            
            const expiringLots = item.lots.filter(lot => lot.expiry_date <= targetDate && lot.quantity_in_lot > 0);
            
            for (const lot of expiringLots) {
                const quantityToMove = lot.quantity_in_lot;

                const potentialRecipients = allUsageRates.filter(usage => 
                    usage.drug_ref && 
                    usage.hospital_ref &&
                    usage.drug_ref.toString() === targetDrug._id.toString() &&
                    usage.hospital_ref._id.toString() !== sourceHospital._id.toString()
                );

                const suggestions = potentialRecipients.map(recipient => {
                    const recipientHospital = recipient.hospital_ref;
                    const recipientLong = recipientHospital.location.coordinates[0];
                    const recipientLat = recipientHospital.location.coordinates[1];

                    const distance = calculateDistance(sourceLat, sourceLong, recipientLat, recipientLong);
                    const demandScore = Math.min(50, recipient.average_monthly_usage * 0.25);
                    const distanceScore = Math.max(0, 50 - (distance * 0.8));

                    const isSameZone = sourceHospital.network_group_id === recipientHospital.network_group_id;
                    let totalScore = demandScore + distanceScore;
                    if (isSameZone) totalScore += 10;

                    const confidenceScore = parseFloat(Math.min(1.0, totalScore / 100).toFixed(2));

                    return {
                        to_hospital_id: recipientHospital._id,
                        hospital_name: recipientHospital.hospital_name,
                        average_monthly_usage: recipient.average_monthly_usage,
                        distance_km: parseFloat(distance.toFixed(1)),
                        confidence_score: confidenceScore,
                        reasoning: `พบ ${recipientHospital.hospital_name} มีอัตราเบิกจ่ายใช้ยาชนิดนี้สูงถึง ${recipient.average_monthly_usage} ชิ้น/เดือน อยู่ห่างออกไปเพียง ${distance.toFixed(1)} กม. ${isSameZone ? '(จัดอยู่ในพื้นที่เครือข่ายย่อยเดียวกัน)' : ''}`
                    };
                }).sort((a, b) => b.confidence_score - a.confidence_score);

                aiRecommendations.push({
                    inventory_id: item._id,
                    drug_id: targetDrug._id, 
                    drug_name: targetDrug.generic_name,
                    trade_name: targetDrug.trade_name,
                    category: targetDrug.category,
                    from_hospital_id: sourceHospital._id, 
                    from_hospital: sourceHospital.hospital_name,
                    expiring_lot: {
                        lot_number: lot.lot_number,
                        expiry_date: lot.expiry_date,
                        quantity: quantityToMove
                    },
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

// =========================================================================
// @desc    ดึงรายการแจ้งเตือนยากลุ่มวิกฤต พร้อมคำแนะนำจาก AI (Alert Queue)
// =========================================================================
const getAlertQueue = async (req, res) => {
    try {
        const allInventory = await Inventory.find()
            .populate('hospital_ref')
            .populate('drug_ref');

        const criticalList = allInventory.filter(item => item.available_quantity <= item.safety_stock_level && item.hospital_ref && item.drug_ref);
        const healthyList = allInventory.filter(item => item.available_quantity > item.safety_stock_level * 1.5 && item.hospital_ref && item.drug_ref);

        const alertQueue = criticalList.map(criticalItem => {
            const targetHospital = criticalItem.hospital_ref;
            const targetDrug = criticalItem.drug_ref;

            const targetLong = targetHospital.location.coordinates[0];
            const targetLat = targetHospital.location.coordinates[1];

            const suggestions = healthyList
                .filter(healthyItem => healthyItem.drug_ref._id.toString() === targetDrug._id.toString() && healthyItem.hospital_ref._id.toString() !== targetHospital._id.toString())
                .map(healthyItem => {
                    const donorHospital = healthyItem.hospital_ref;
                    const donorLong = donorHospital.location.coordinates[0];
                    const donorLat = donorHospital.location.coordinates[1];

                    const distance = calculateDistance(targetLat, targetLong, donorLat, donorLong);
                    const stockSurplus = healthyItem.available_quantity - healthyItem.safety_stock_level;
                    const stockScore = Math.min(50, stockSurplus * 2);
                    const distanceScore = Math.max(0, 50 - (distance * 0.8));

                    const confidenceScore = parseFloat(((stockScore + distanceScore) / 100).toFixed(2));

                    return {
                        donor_inventory_id: healthyItem._id,
                        hospital_name: donorHospital.hospital_name,
                        available_quantity: healthyItem.available_quantity,
                        distance_km: parseFloat(distance.toFixed(1)),
                        confidence_score: confidenceScore,
                        reasoning: `พบ ${donorHospital.hospital_name} อยู่ห่างออกไป ${distance.toFixed(1)} กม. และมีปริมาณยาสำรองพร้อมปล่อยยืมจำนวน ${healthyItem.available_quantity} หลอด/เม็ด`
                    };
                }).sort((a, b) => b.confidence_score - a.confidence_score);

            return {
                alert_id: criticalItem._id,
                drug_name: targetDrug.generic_name,
                trade_name: targetDrug.trade_name,
                category: targetDrug.category,
                hospital_in_need: targetHospital.hospital_name,
                current_stock: criticalItem.available_quantity,
                safety_level: criticalItem.safety_stock_level,
                detected_at: criticalItem.updatedAt,
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

// =========================================================================
// @desc    ดึงข้อมูลโรงพยาบาลที่มีปัญหายาวิกฤต และยาใกล้หมดอายุ เพื่อนำไปปักหมุดบนแผนที่
// =========================================================================
const getMapAnalytics = async (req, res) => {
    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 90);

        const allInventory = await Inventory.find()
            .populate('hospital_ref')
            .populate('drug_ref');

        const mapMarkers = [];

        for (const item of allInventory) {
            const hospital = item.hospital_ref;
            const drug = item.drug_ref;

            if (!hospital || !hospital.location || !hospital.location.coordinates || !drug) continue;

            const coordinates = hospital.location.coordinates; 

            if (item.available_quantity <= item.safety_stock_level) {
                mapMarkers.push({
                    marker_type: 'CRITICAL_STOCK', 
                    hospital_id: hospital._id,
                    hospital_name: hospital.hospital_name,
                    coordinates: { lng: coordinates[0], lat: coordinates[1] },
                    drug_info: {
                        drug_id: drug._id,
                        generic_name: drug.generic_name,
                        trade_name: drug.trade_name,
                        category: drug.category
                    },
                    details: {
                        current_stock: item.available_quantity,
                        safety_level: item.safety_stock_level,
                        alert_message: `🚨 สต็อกวิกฤต: ยาเหลือเพียง ${item.available_quantity} ชิ้น (เกณฑ์ปลอดภัยคือ ${item.safety_stock_level} ชิ้น)`
                    }
                });
            }

            const expiringLots = item.lots.filter(lot => lot.expiry_date <= targetDate && lot.quantity_in_lot > 0);
            
            for (const lot of expiringLots) {
                mapMarkers.push({
                    marker_type: 'NEAR_EXPIRY', 
                    hospital_id: hospital._id,
                    hospital_name: hospital.hospital_name,
                    coordinates: { lng: coordinates[0], lat: coordinates[1] },
                    drug_info: {
                        drug_id: drug._id,
                        generic_name: drug.generic_name,
                        trade_name: drug.trade_name,
                        category: drug.category
                    },
                    details: {
                        lot_number: lot.lot_number,
                        expiry_date: lot.expiry_date,
                        quantity: lot.quantity_in_lot,
                        alert_message: `⏳ เสี่ยงหมดอายุ: ล็อต ${lot.lot_number} จำนวน ${lot.quantity_in_lot} ชิ้น จะหมดอายุในวันที่ ${new Date(lot.expiry_date).toLocaleDateString('th-TH')}`
                    }
                });
            }
        }

        return res.status(200).json({ success: true, count: mapMarkers.length, data: mapMarkers });

    } catch (error) {
        console.error('❌ AI Map Analytics error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// =========================================================================
// @desc    ค้นหายาฉุกเฉิน Real-Time บนแผนที่ (กรองอัตโนมัติจากโรงพยาบาลที่ผู้ใช้ Login)
// =========================================================================
const searchEmergencyDrug = async (req, res) => {
    try {
        const { drug_id } = req.body;

        if (!drug_id) {
            return res.status(400).json({ success: false, message: 'โปรดระบุตัวยาที่ต้องการค้นหา' });
        }

        let from_hospital_id = req.body.from_hospital_id;
        if (req.user) {
            if (req.user.hospital_id) {
                from_hospital_id = req.user.hospital_id;
            } else if (req.user.hospital && req.user.hospital.objectId) {
                from_hospital_id = req.user.hospital.objectId;
            }
        }

        if (!from_hospital_id) {
            return res.status(401).json({ 
                success: false, 
                message: 'ไม่พบข้อมูลโรงพยาบาลต้นทาง (โปรดตรวจสอบสถานะการ Login หรือส่ง from_hospital_id มาทดสอบ)' 
            });
        }

        const sourceHospital = await Hospital.findById(from_hospital_id);
        if (!sourceHospital) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลโรงพยาบาลต้นทางในระบบ' });

        const srcLong = sourceHospital.location.coordinates[0];
        const srcLat = sourceHospital.location.coordinates[1];

        const allInventory = await Inventory.find({ drug_ref: drug_id })
            .populate('hospital_ref')
            .populate('drug_ref');

        const candidates = allInventory.filter(item =>
            item.hospital_ref &&
            item.hospital_ref._id.toString() !== from_hospital_id.toString() &&
            item.available_quantity > item.safety_stock_level
        );

        const searchResults = await Promise.all(
            candidates.map(async (item) => {
                const donorHosp = item.hospital_ref;
                const donorLong = donorHosp.location.coordinates[0];
                const donorLat = donorHosp.location.coordinates[1];

                const route = await calculateRealRoute(srcLat, srcLong, donorLat, donorLong);

                return {
                    inventory_id: item._id,
                    hospital_id: donorHosp._id,
                    hospital_name: donorHosp.hospital_name,
                    coordinates: { lng: donorLong, lat: donorLat },
                    available_quantity: item.available_quantity,
                    distance_km: route.distanceKm,
                    estimated_time_minutes: route.minutes, 
                    is_estimate: route.isEstimate, 
                    network_zone: donorHosp.network_group_id
                };
            })
        );

        searchResults.sort((a, b) => a.estimated_time_minutes - b.estimated_time_minutes);

        return res.status(200).json({ 
            success: true, 
            from_hospital_name: sourceHospital.hospital_name,
            count: searchResults.length, 
            data: searchResults 
        });

    } catch (error) {
        console.error('❌ Search Emergency Drug Error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = {
    getAlertQueue,
    getExpiryRedistribution,
    getMapAnalytics,
    searchEmergencyDrug
};