const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory'); 
const BloodInventory = require('../models/BloodInventory'); // 🌟 เพิ่มการดึง Model คลังเลือดแยกที่สร้างใหม่

// =========================================================================
// @desc    ดูรายการยาและจำนวนสต็อกทั้งหมดของโรงพยาบาลเฉพาะเจาะจงด้วย ID
// @route   GET /api/hospitals/:hospital_id/inventory
// =========================================================================
const getHospitalInventory = async (req, res) => {
    try {
        const { hospital_id } = req.params;
        const userHospitalId = req.user?.hospital_id;

        if (!userHospitalId || userHospitalId.toString() !== hospital_id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดูคลังยาของโรงพยาบาลอื่น' 
            });
        }

        const stock = await Inventory.find({ hospital_ref: hospital_id })
            .populate('drug_ref', 'drug_id generic_name trade_name category strength dosage_form')
            .sort({ updatedAt: -1 });

        return res.status(200).json({
            success: true,
            count: stock.length,
            data: stock
        });
    } catch (error) {
        console.error('❌ Get hospital inventory error:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ success: false, message: 'รูปแบบ ID โรงพยาบาลไม่ถูกต้อง' });
        }
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// =========================================================================
// 🩸 @desc    ดูรายการคลังเลือดทั้งหมดของโรงพยาบาลเฉพาะเจาะจงด้วย ID (สร้างแยกฟังก์ชัน)
// 🩸 @route   GET /api/hospitals/:hospital_id/blood-inventory
// =========================================================================
const getHospitalBloodInventory = async (req, res) => {
    try {
        const { hospital_id } = req.params;

        // 🔒 เช็คสิทธิ์ความปลอดภัยเหมือนฝั่งคลังยาทุกประการ เพื่อความปลอดภัยของข้อมูลคลังเลือด
        const userHospitalId = req.user?.hospital_id;

        if (!userHospitalId || userHospitalId.toString() !== hospital_id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดูคลังเลือดของโรงพยาบาลอื่น ต้องเป็นเจ้าหน้าที่ของโรงพยาบาลนี้เท่านั้น' 
            });
        }

        // 🟢 ดึงข้อมูลจากตาราง BloodInventory แยกตรงๆ ออกมาเรียงตามอัปเดตล่าสุด
        const bloodStock = await BloodInventory.find({ hospital_ref: hospital_id })
            .sort({ blood_group: 1, component_type: 1 }); // เรียงตามหมู่เลือดและประเภทเพื่อง่ายต่อหน้าตารางฝั่งหน้าบ้าน

        return res.status(200).json({
            success: true,
            count: bloodStock.length,
            data: bloodStock
        });
    } catch (error) {
        console.error('❌ Get hospital blood inventory error:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ success: false, message: 'รูปแบบ ID โรงพยาบาลไม่ถูกต้อง' });
        }
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// 🌟 ส่งออกทั้ง 2 ฟังก์ชันไปใช้งานร่วมกัน
module.exports = { 
    getHospitalInventory,
    getHospitalBloodInventory 
};