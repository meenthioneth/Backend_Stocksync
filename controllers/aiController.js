const Inventory = require('../models/Inventory');
const DrugUsageRate = require('../models/DrugUsageRate');
const Hospital = require('../models/Hospital');
const BloodInventory = require('../models/BloodInventory'); // 🩸 ดึง Model คลังเลือดเข้ามาร่วมประมวลผล AI

// =========================================================================
// 🧮 สูตรคำนวณระยะทางและเส้นทางขนส่งด่วน (ใช้ร่วมกันทั้งระบบยาและระบบเลือด)
// =========================================================================
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // รัศมีของโลก (กิโลเมตร)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))); 
};

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
            flon: String(fromLon), flat: String(fromLat),
            tlon: String(toLon), tlat: String(toLat),
            mode: 't', key: apiKey
        });
        if (typeof fetch !== 'function') return fallback();

        const response = await fetch(`https://api.longdo.com/RouteService/json/route/guide?${params}`);
        if (!response.ok) return fallback();

        const json = await response.json();
        const route = json && json.data && json.data[0];
        if (!route || typeof route.distance !== 'number') return fallback();

        return {
            distanceKm: parseFloat((route.distance / 1000).toFixed(1)),
            minutes: Math.round(route.interval / 60),
            isEstimate: false
        };
    } catch (error) {
        console.error('⚠️ Longdo Route API Error:', error.message);
        return fallback();
    }
};

// 🩸 ตารางการจับคู่หมู่เลือดทดแทนในกรณีจำเป็นวิกฤต (Universal Blood Compatibility Matrix)
const BLOOD_COMPATIBILITY = {
    "A+": ["A+", "O+"],
    "B+": ["B+", "O+"],
    "AB+": ["AB+", "A+", "B+", "O+"],
    "O+": ["O+"],
    "A-": ["A-", "O-"],
    "B-": ["B-", "O-"],
    "AB-": ["AB-", "A-", "B-", "O-"],
    "O-": ["O-"]
};

// =========================================================================
// [PART A]: 💊 ระบบปัญญาประดิษฐ์ฝั่ง "คลังยา" (โค้ดเดิมของคุณ)
// =========================================================================

exports.getExpiryRedistribution = async (req, res) => {
    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 90);

        const activeInventories = await Inventory.find({
            "lots.expiry_date": { $lte: targetDate },
            "lots.quantity_in_lot": { $gt: 0 }
        }).populate('hospital_ref').populate('drug_ref');

        if (!activeInventories || activeInventories.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const drugIds = activeInventories
            .filter(i => i.drug_ref && i.drug_ref._id)
            .map(i => i.drug_ref._id);
        
        const allUsageRates = await DrugUsageRate.find({ drug_ref: { $in: drugIds } }).populate('hospital_ref');
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
                    usage.drug_ref && usage.hospital_ref &&
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
                    expiring_lot: { lot_number: lot.lot_number, expiry_date: lot.expiry_date, quantity: quantityToMove },
                    ai_suggestion: suggestions.length > 0 ? suggestions[0] : {
                        hospital_name: "ไม่พบโรงพยาบาลปลายทางในเครือข่ายที่มียอดความต้องการใช้ยานี้",
                        confidence_score: 0.0,
                        reasoning: "ไม่มีสถิติความต้องการใช้นอกคลังต้นทาง โปรดตรวจสอบระดับสต็อกในภาพรวมระบบอีกครั้ง"
                    }
                });
            }
        }
        return res.status(200).json({ success: true, count: aiRecommendations.length, data: aiRecommendations });
    } catch (error) {
        console.error('❌ AI Expiry Redistribution error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getAlertQueue = async (req, res) => {
    try {
        const allInventory = await Inventory.find().populate('hospital_ref').populate('drug_ref');
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
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getMapAnalytics = async (req, res) => {
    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 90);

        const allInventory = await Inventory.find().populate('hospital_ref').populate('drug_ref');
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
                    drug_info: { drug_id: drug._id, generic_name: drug.generic_name, trade_name: drug.trade_name, category: drug.category },
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
                    drug_info: { drug_id: drug._id, generic_name: drug.generic_name, trade_name: drug.trade_name, category: drug.category },
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
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.searchEmergencyDrug = async (req, res) => {
    try {
        const { drug_id } = req.body;
        if (!drug_id) return res.status(400).json({ success: false, message: 'โปรดระบุตัวยาที่ต้องการค้นหา' });

        let from_hospital_id = req.body.from_hospital_id || req.user?.hospital_id || req.user?.hospital?.objectId;
        if (!from_hospital_id) return res.status(401).json({ success: false, message: 'ไม่พบข้อมูลโรงพยาบาลต้นทาง' });

        const sourceHospital = await Hospital.findById(from_hospital_id);
        if (!sourceHospital) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลโรงพยาบาลต้นทางในระบบ' });

        const srcLong = sourceHospital.location.coordinates[0];
        const srcLat = sourceHospital.location.coordinates[1];

        const allInventory = await Inventory.find({ drug_ref: drug_id }).populate('hospital_ref').populate('drug_ref');
        const candidates = allInventory.filter(item => item.hospital_ref && item.hospital_ref._id.toString() !== from_hospital_id.toString() && item.available_quantity > item.safety_stock_level);

        const searchResults = await Promise.all(
            candidates.map(async (item) => {
                const donorHosp = item.hospital_ref;
                const donorLong = donorHosp.location.coordinates[0];
                const donorLat = donorHosp.location.coordinates[1];

                const route = await calculateRealRoute(srcLat, srcLong, donorLat, donorLong);
                return {
                    inventory_id: item._id, hospital_id: donorHosp._id, hospital_name: donorHosp.hospital_name,
                    coordinates: { lng: donorLong, lat: donorLat }, available_quantity: item.available_quantity,
                    distance_km: route.distanceKm, estimated_time_minutes: route.minutes, is_estimate: route.isEstimate, network_zone: donorHosp.network_group_id
                };
            })
        );
        searchResults.sort((a, b) => a.estimated_time_minutes - b.estimated_time_minutes);
        return res.status(200).json({ success: true, from_hospital_name: sourceHospital.hospital_name, count: searchResults.length, data: searchResults });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// =========================================================================
// [PART B]: 🩸 ระบบปัญญาประดิษฐ์ฝั่ง "คลังเลือด" (แก้ไขบั๊กปีกกาเรียบร้อย)
// =========================================================================

// @desc    ค้นหาคลังเลือดฉุกเฉินสลับกรุ๊ปอัตโนมัติ Real-Time (AI Cross-Matching)
exports.searchEmergencyBlood = async (req, res) => {
    try {
        const { blood_group, component_type } = req.body;
        let from_hospital_id = req.body.from_hospital_id || req.user?.hospital_id || req.user?.hospital?.objectId;

        if (!blood_group || !component_type) {
            return res.status(400).json({ success: false, message: 'โปรดระบุหมู่เลือดและประเภทส่วนประกอบเลือด' });
        }
        if (!from_hospital_id) return res.status(401).json({ success: false, message: 'ไม่พบข้อมูลโรงพยาบาลต้นทาง' });

        const sourceHospital = await Hospital.findById(from_hospital_id);
        if (!sourceHospital) return res.status(404).json({ success: false, message: 'ไม่พบพิกัดโรงพยาบาลต้นทาง' });
        const [srcLong, srcLat] = sourceHospital.location.coordinates;

        // 🧠 AI Cross-Matching: สลับหมู่เลือดทดแทนอัตโนมัติกรณีจำเป็นวิกฤต
        const allowedGroups = BLOOD_COMPATIBILITY[blood_group] || [blood_group];

        const bloodStock = await BloodInventory.find({
            blood_group: { $in: allowedGroups },
            component_type: component_type,
            hospital_ref: { $ne: from_hospital_id },
            available_units: { $gt: 0 }
        }).populate('hospital_ref');

        const searchResults = await Promise.all(
            bloodStock.map(async (item) => {
                const donorHosp = item.hospital_ref;
                const [donorLong, donorLat] = donorHosp.location.coordinates;

                const route = await calculateRealRoute(srcLat, srcLong, donorLat, donorLong);
                const isExactMatch = item.blood_group === blood_group;

                return {
                    blood_inventory_id: item._id, hospital_id: donorHosp._id, hospital_name: donorHosp.hospital_name,
                    coordinates: { lng: donorLong, lat: donorLat }, blood_group: item.blood_group,
                    match_type: isExactMatch ? "ตรงกลุ่ม (Exact Match)" : "กลุ่มทดแทนฉุกเฉิน (Compatible Match)",
                    available_units: item.available_units, distance_km: route.distanceKm, estimated_time_minutes: route.minutes, is_estimate: route.isEstimate
                };
            })
        );

        searchResults.sort((a, b) => {
            if (a.match_type !== b.match_type) return a.match_type.localeCompare(b.match_type);
            return a.estimated_time_minutes - b.estimated_time_minutes;
        });

        return res.status(200).json({ success: true, from_hospital_name: sourceHospital.hospital_name, count: searchResults.length, data: searchResults });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    ดึงรายการถุงเลือดเสี่ยงหมดอายุล่วงหน้า 7 วัน พร้อมแนะนำจุดกระจายสับเปลี่ยน
exports.getBloodExpiryRedistribution = async (req, res) => {
    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 7); // เลือดหมดไว ดักล่วงหน้า 7 วัน

        const expiringBlood = await BloodInventory.find({ "lots.expiry_date": { $lte: targetDate }, available_units: { $gt: 0 } }).populate('hospital_ref');
        const aiRecommendations = [];

        for (const item of expiringBlood) {
            const sourceHospital = item.hospital_ref;
            if (!sourceHospital) continue;

            const [srcLong, srcLat] = sourceHospital.location.coordinates;
            const expiringLots = item.lots.filter(lot => lot.expiry_date <= targetDate && lot.quantity_in_bag > 0);

            for (const lot of expiringLots) {
                const recipientCandidates = await BloodInventory.find({
                    blood_group: item.blood_group, component_type: item.component_type,
                    hospital_ref: { $ne: sourceHospital._id }, available_units: { $lte: 3 }
                }).populate('hospital_ref');

                const suggestions = recipientCandidates.map(recipient => {
                    const recHosp = recipient.hospital_ref;
                    const [recLong, recLat] = recHosp.location.coordinates;
                    const distance = calculateDistance(srcLat, srcLong, recLat, recLong);

                    return {
                        to_hospital_id: recHosp._id, hospital_name: recHosp.hospital_name,
                        current_stock: recipient.available_units, distance_km: parseFloat(distance.toFixed(1)),
                        reasoning: `พบ ${recHosp.hospital_name} กำลังวิกฤตมีเลือดกลุ่มนี้เหลือติดตู้เพียง ${recipient.available_units} ยูนิต อยู่ห่างออกไป ${distance.toFixed(1)} กม. ควรเร่งกระจายถุงเลือดนี้ไปสลับใช้ก่อนหมดอายุ`
                    };
                }).sort((a, b) => a.distance_km - b.distance_km);

                aiRecommendations.push({
                    blood_inventory_id: item._id, blood_group: item.blood_group, component_type: item.component_type, from_hospital: sourceHospital.hospital_name,
                    expiring_bag: { bag_number: lot.bag_number, expiry_date: lot.expiry_date, quantity: lot.quantity_in_bag },
                    ai_suggestion: suggestions.length > 0 ? suggestions[0] : { hospital_name: "คลังภาพรวมในเครือข่ายยังมีสต็อกเพียงพอ", reasoning: "สำรองไว้ใช้งานในหน่วยงานตนเองต่อไป" }
                });
            }
        }
        return res.status(200).json({ success: true, count: aiRecommendations.length, data: aiRecommendations });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    วิเคราะห์ตู้เลือดวิกฤตขาดแคลน พร้อมหาคลังสำรองส่วนเกินช่วยเติมสต็อก (🌟 แก้ไขจุดพังปีกกาหายเรียบร้อย)
exports.getBloodAlertQueue = async (req, res) => {
    try {
        const allBlood = await BloodInventory.find().populate('hospital_ref');
        const criticalList = allBlood.filter(b => b.available_units <= b.safety_unit_level && b.hospital_ref);
        const surplusList = allBlood.filter(b => b.available_units > b.safety_unit_level * 2 && b.hospital_ref);

        const alertQueue = criticalList.map(critItem => {
            const targetHosp = critItem.hospital_ref;
            const [tLong, tLat] = targetHosp.location.coordinates;

            const suggestions = surplusList
                .filter(s => s.blood_group === critItem.blood_group && s.component_type === critItem.component_type && s.hospital_ref._id.toString() !== targetHosp._id.toString())
                .map(s => {
                    const donorHosp = s.hospital_ref;
                    const [dLong, dLat] = donorHosp.location.coordinates;
                    const distance = calculateDistance(tLat, tLong, dLat, dLong);

                    return {
                        donor_inventory_id: s._id, hospital_name: donorHosp.hospital_name,
                        available_units: s.available_units, distance_km: parseFloat(distance.toFixed(1)),
                        reasoning: `พบคลังเลือดสำรองส่วนเกินที่ ${donorHosp.hospital_name} (${s.available_units} ยูนิต) ห่างออกไป ${distance.toFixed(1)} กม.`
                    };
                }).sort((a, b) => a.distance_km - b.distance_km);

            return {
                alert_id: critItem._id, blood_group: critItem.blood_group, component_type: critItem.component_type,
                hospital_in_need: targetHosp.hospital_name, current_stock: critItem.available_units, safety_level: critItem.safety_unit_level, detected_at: critItem.updatedAt,
                ai_suggestion: suggestions.length > 0 ? suggestions[0] : { hospital_name: "⚠️ คลังเลือดขาดแคลนทั้งระบบจังหวัด", reasoning: "โปรดประสานงานเหล่ากาชาดจังหวัดเพื่อเปิดรับบริจาคด่วน" }
            };
        });
        return res.status(200).json({ success: true, count: alertQueue.length, data: alertQueue });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    ดึงข้อมูลพิกัดและรายละเอียดตู้เลือดเพื่อนำไปวาด Marker บนแผนที่ความเสี่ยง
exports.getBloodMapAnalytics = async (req, res) => {
    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 7);

        const allBlood = await BloodInventory.find().populate('hospital_ref');
        const mapMarkers = [];

        for (const item of allBlood) {
            const hosp = item.hospital_ref;
            if (!hosp || !hosp.location) continue;
            const coordinates = hosp.location.coordinates;

            if (item.available_units <= item.safety_unit_level) {
                mapMarkers.push({
                    marker_type: 'CRITICAL_BLOOD_STOCK', hospital_id: hosp._id, hospital_name: hosp.hospital_name,
                    coordinates: { lng: coordinates[0], lat: coordinates[1] },
                    blood_info: { blood_group: item.blood_group, component_type: item.component_type },
                    details: { current_stock: item.available_units, safety_level: item.safety_unit_level, alert_message: `🚨 วิกฤตสต็อก: เลือดกรุ๊ป ${item.blood_group} (${item.component_type}) เหลือเพียง ${item.available_units} ยูนิต` }
                });
            }

            const expiringLots = item.lots.filter(lot => lot.expiry_date <= targetDate && lot.quantity_in_bag > 0);
            for (const lot of expiringLots) {
                mapMarkers.push({
                    marker_type: 'NEAR_BLOOD_EXPIRY', hospital_id: hosp._id, hospital_name: hosp.hospital_name,
                    coordinates: { lng: coordinates[0], lat: coordinates[1] },
                    blood_info: { blood_group: item.blood_group, component_type: item.component_type },
                    details: { bag_number: lot.bag_number, expiry_date: lot.expiry_date, quantity: lot.quantity_in_bag, alert_message: `⏳ ใกล้หมดอายุ: ถุงรหัส ${lot.bag_number} กลุ่ม ${item.blood_group} ค้างตู้เกินกำหนด` }
                });
            }
        }
        return res.status(200).json({ success: true, count: mapMarkers.length, data: mapMarkers });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};