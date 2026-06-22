const Inventory = require('../models/Inventory');
const Hospital = require('../models/Hospital'); 
const Drug = require('../models/Drug');

// @desc    Get network inventory overview for map markers (Page 2)
// @route   GET /api/inventory/network-overview
const getNetworkOverview = async (req, res) => {
    try {
        // ดึงข้อมูลคลังยา พร้อมดึงข้อมูลจากโมเดล Hospital และ Drug มารวมกัน (Populate)
        const networkStock = await Inventory.find()
            .populate('hospital_ref')
            .populate('drug_ref');

        // แปลงข้อมูลให้อยู่ในรูปแบบที่ Frontend เอาไปใช้งานปักหมุดง่ายๆ
        const formattedData = networkStock.map(item => {
            const available = item.available_quantity;
            const safety = item.safety_stock_level;
            
            // คำนวณสถานะสต็อก (Computed Field) ตามสเปกของคุณ
            let stockStatus = 'GREEN'; // ปกติ
            if (available <= safety) {
                stockStatus = 'RED'; // วิกฤต ต่ำกว่า Safety Stock
            } else if (available <= safety * 1.5) {
                stockStatus = 'YELLOW'; // เตือน ใกล้หมดใน 7 วัน
            }

            return {
                inventory_id: item._id,
                hospital: {
                    id: item.hospital_ref.hospital_id,
                    name: item.hospital_ref.hospital_name,
                    type: item.hospital_ref.hospital_type,
                    coordinates: item.hospital_ref.location.coordinates // [long, lat]
                },
                drug: {
                    id: item.drug_ref.drug_id,
                    generic_name: item.drug_ref.generic_name,
                    trade_name: item.drug_ref.trade_name,
                    category: item.drug_ref.category
                },
                available_quantity: available,
                reserved_quantity: item.reserved_quantity,
                safety_stock_level: safety,
                stock_status: stockStatus, // ส่งสถานะสีไปให้แผนที่ใช้เปลี่ยนสีหมุด
                ward_location: item.ward_location
            };
        });

        return res.status(200).json({ success: true, data: formattedData });
    } catch (error) {
        console.error('❌ Get network overview error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = {
    getNetworkOverview
};