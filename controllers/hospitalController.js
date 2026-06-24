const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory'); // หรือชื่อ Model คลังยาของคุณ

// @desc    ดูรายการยาและจำนวนสต็อกทั้งหมดของโรงพยาบาลเฉพาะเจาะจงด้วย ID (เฉพาะสมาชิกใน รพ.)
// @route   GET /api/hospitals/:hospital_id/inventory
const getHospitalInventory = async (req, res) => {
    try {
        const { hospital_id } = req.params;

        // 🔒 [จุดสำคัญ]: เช็คสิทธิ์ว่าผู้ใช้งานที่ Login อยู่ สังกัดโรงพยาบาลนี้จริงไหม
        // req.user.hospital_id ได้มาจาก Auth Middleware (protect) ตอนแกะสิทธิ์จาก Token
        const userHospitalId = req.user?.hospital_id;

        // ทำการแปลงค่าเป็น String ก่อนเทียบกันเพื่อป้องกัน Error จากประเภทข้อมูล ObjectId
        if (!userHospitalId || userHospitalId.toString() !== hospital_id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดูคลังยาของโรงพยาบาลอื่น ต้องเป็นเจ้าหน้าที่ของโรงพยาบาลนี้เท่านั้น' 
            });
        }

        // 🟢 ถ้าตรวจสอบแล้วว่าอยู่ รพ. เดียวกันจริง ดึงข้อมูลตามปกติ
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



module.exports = { getHospitalInventory };