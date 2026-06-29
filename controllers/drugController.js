const Drug = require('../models/Drug');

// =========================================================================
// @desc    ค้นหายาด้วยชื่อ (generic_name / trade_name) สำหรับช่องค้นหายาฉุกเฉิน
//          ใช้ผลลัพธ์ (Drug._id) ไปยิงต่อที่ POST /api/ai/search-emergency
// @route   GET /api/drugs/search?q=คำค้น&limit=10
// =========================================================================
const searchDrugs = async (req, res) => {
    try {
        const { q } = req.query;
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 25);

        // ไม่ส่ง q มา หรือพิมพ์สั้นเกินไป (< 2 ตัวอักษร) -> ส่ง array ว่างกลับไปเฉยๆ ไม่ error
        // (เพื่อให้ฝั่งหน้าบ้านแสดง state "พิมพ์เพื่อค้นหา" ได้ลื่นๆ ไม่ต้องดักเงื่อนไขเพิ่ม)
        if (!q || q.trim().length < 2) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        // ค้นหาแบบ case-insensitive ทั้งชื่อสามัญและชื่อการค้า ด้วย Regex (เหมาะกับ dataset ขนาด MVP)
        const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, 'i');

        const drugs = await Drug.find({
            $or: [{ generic_name: pattern }, { trade_name: pattern }]
        })
            .limit(limit)
            .sort({ generic_name: 1 });

        const data = drugs.map((d) => ({
            drugObjectId: d._id,
            drug_id: d.drug_id,
            generic_name: d.generic_name,
            trade_name: d.trade_name,
            category: d.category
        }));

        return res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('❌ Search drugs error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = { searchDrugs };
