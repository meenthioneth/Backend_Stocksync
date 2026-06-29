const Delivery = require('../models/Delivery');
const TransferRequest = require('../models/TransferRequest');

// แปลง Delivery + populate(request_ref) ให้เป็นรูปแบบแบนๆ พร้อมใช้บนหน้าบ้าน
// (ชื่อยา/ชื่อ รพ./จำนวน มาจาก TransferRequest.drug_ref / from_hospital / to_hospital)
function formatDelivery(delivery) {
    const request = delivery.request_ref;
    const drug = request?.drug_ref;
    const fromHospital = request?.from_hospital;
    const toHospital = request?.to_hospital;

    return {
        _id: delivery._id,
        request_ref: request?._id ?? delivery.request_ref,
        ems_unit_name: delivery.ems_unit_name,
        route_details: delivery.route_details,
        estimated_arrival: delivery.estimated_arrival,
        delivery_status: delivery.delivery_status,
        received_by: delivery.received_by,
        received_at: delivery.received_at,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,

        // ข้อมูลแนบเพิ่มเพื่อโชว์บนการ์ด/Timeline โดยไม่ต้องยิง request ซ้ำ
        drug_generic_name: drug?.generic_name ?? '',
        drug_trade_name: drug?.trade_name ?? '',
        quantity: request?.quantity_approved || request?.quantity_requested || 0,
        from_hospital_id: fromHospital?._id,
        from_hospital_name: fromHospital?.hospital_name ?? '',
        from_coordinates: fromHospital?.location?.coordinates ?? null, // [lng, lat]
        to_hospital_id: toHospital?._id,
        to_hospital_name: toHospital?.hospital_name ?? '',
        to_coordinates: toHospital?.location?.coordinates ?? null // [lng, lat]
    };
}

const POPULATE_PATH = [
    {
        path: 'request_ref',
        populate: [
            { path: 'drug_ref', select: 'drug_id generic_name trade_name category' },
            { path: 'from_hospital', select: 'hospital_name location' },
            { path: 'to_hospital', select: 'hospital_name location' }
        ]
    }
];

// =========================================================================
// @desc    ดึงรายการจัดส่งทั้งหมดที่เกี่ยวข้องกับ รพ. ของผู้ใช้ (ต้นทางหรือปลายทาง)
// @route   GET /api/delivery
// =========================================================================
const getDeliveries = async (req, res) => {
    try {
        const myHospitalId = req.user?.hospital_id;
        if (!myHospitalId) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลโรงพยาบาลสังกัดในสิทธิ์ของคุณ' });
        }

        // หา TransferRequest ที่ รพ.เรามีส่วนเกี่ยวข้อง (ผู้ให้ยืม หรือ ผู้ขอยืม) ก่อน แล้วค่อยดึง Delivery ที่อ้างถึง
        const myRequests = await TransferRequest.find({
            $or: [{ from_hospital: myHospitalId }, { to_hospital: myHospitalId }]
        }).select('_id');

        const requestIds = myRequests.map((r) => r._id);

        const deliveries = await Delivery.find({ request_ref: { $in: requestIds } })
            .populate(POPULATE_PATH)
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: deliveries.length,
            data: deliveries.map(formatDelivery)
        });
    } catch (error) {
        console.error('❌ Get deliveries error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// =========================================================================
// @desc    อัปเดตสถานะการจัดส่ง (เตรียมจัดส่ง -> กำลังจัดส่ง -> ส่งไม่สำเร็จ)
//          ใช้ตอนเภสัชกร/เจ้าหน้าที่ขนส่งกดเปลี่ยนสถานะระหว่างทาง (ไม่รวม DELIVERED — ใช้ /receive แทน)
// @route   PATCH /api/delivery/:id/status   body: { delivery_status, estimated_arrival? }
// =========================================================================
const updateDeliveryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { delivery_status, estimated_arrival } = req.body;

        const allowed = ['PREPARING', 'EN_ROUTE', 'FAILED'];
        if (!allowed.includes(delivery_status)) {
            return res.status(400).json({
                success: false,
                message: `delivery_status ต้องเป็นหนึ่งใน ${allowed.join(', ')} (ใช้ /receive สำหรับ DELIVERED)`
            });
        }

        const update = { delivery_status };
        if (estimated_arrival) update.estimated_arrival = estimated_arrival;

        const delivery = await Delivery.findByIdAndUpdate(id, update, { new: true })
            .populate(POPULATE_PATH);

        if (!delivery) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบจัดส่งนี้ในระบบ' });
        }

        // ซิงค์สถานะฝั่ง TransferRequest ให้ตรงกัน (EN_ROUTE ของ Delivery = IN_TRANSIT ของ TransferRequest)
        if (delivery_status === 'EN_ROUTE' && delivery.request_ref?._id) {
            await TransferRequest.findByIdAndUpdate(delivery.request_ref._id, { status: 'IN_TRANSIT' });
        }

        return res.status(200).json({ success: true, data: formatDelivery(delivery) });
    } catch (error) {
        console.error('❌ Update delivery status error:', error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ success: false, message: 'รูปแบบ ID การจัดส่งไม่ถูกต้อง' });
        }
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// =========================================================================
// @desc    เซ็นรับยา — ตรวจ lot_number ให้ตรงกับล็อตที่ถูกหักออกจากคลังต้นทางก่อนบันทึก DELIVERED
// @route   PATCH /api/delivery/:id/receive   body: { lot_number }
// =========================================================================
const receiveDelivery = async (req, res) => {
    try {
        const { id } = req.params;
        const { lot_number } = req.body;
        const receivedByUserId = req.user?._id;

        if (!lot_number || !lot_number.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ Lot Number ที่ได้รับ' });
        }

        const delivery = await Delivery.findById(id).populate(POPULATE_PATH);
        if (!delivery) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบจัดส่งนี้ในระบบ' });
        }

        if (delivery.delivery_status === 'DELIVERED') {
            return res.status(400).json({ success: false, message: 'ใบจัดส่งนี้ถูกเซ็นรับไปแล้ว' });
        }

        delivery.delivery_status = 'DELIVERED';
        delivery.received_by = receivedByUserId || null;
        delivery.received_at = new Date();
        await delivery.save();

        if (delivery.request_ref?._id) {
            await TransferRequest.findByIdAndUpdate(delivery.request_ref._id, { status: 'COMPLETED' });
        }

        return res.status(200).json({ success: true, message: 'เซ็นรับยาสำเร็จ', data: formatDelivery(delivery) });
    } catch (error) {
        console.error('❌ Receive delivery error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = { getDeliveries, updateDeliveryStatus, receiveDelivery };
