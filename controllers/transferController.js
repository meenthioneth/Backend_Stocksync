const TransferRequest = require('../models/TransferRequest');
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Delivery = require('../models/Delivery');

// @desc    ดึงรายการคำขอยืมยาที่ส่งมาถึงโรงพยาบาลของฉัน (Page 4 - Inbox แท็บรออนุมัติ)
// @route   GET /api/transfers/inbox
const getIncomingTransfers = async (req, res) => {
    try {
        // ดึงไอดีโรงพยาบาลของผู้ใช้งานปัจจุบันที่แกะมาจาก Auth Token (จาก Middleware)
        const myHospitalId = req.user?.hospital_id; 

        if (!myHospitalId) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลโรงพยาบาลสังกัดในสิทธิ์ของคุณ' });
        }

        // ค้นหาคำขอในคอลเลกชัน โดยคัดกรองเฉพาะตัวที่ 'from_hospital' (ต้นทาง/ผู้ให้ยืม) ตรงกับ รพ. ของเรา
        const inboxTransfers = await TransferRequest.find({ from_hospital: myHospitalId })
            .populate('to_hospital', 'hospital_id hospital_name hospital_type') // รพ. ปลายทางที่ส่งคำขอมายืมเรา
            .populate('drug_ref', 'drug_id generic_name trade_name category')
            .sort({ createdAt: -1 }); // เอาคำขอล่าสุดขึ้นก่อน

        return res.status(200).json({
            success: true,
            count: inboxTransfers.length,
            data: inboxTransfers
        });
        
    } catch (error) {
        console.error('❌ Get incoming transfers error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// @desc    ดึงรายการคำขอยืมยาที่โรงพยาบาลของฉันส่งออกไปขอยืมจาก รพ. อื่น (Page 4 - Outbox)
// @route   GET /api/transfers/outbox
const getOutgoingTransfers = async (req, res) => {
    try {
        const myHospitalId = req.user?.hospital_id;

        if (!myHospitalId) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลโรงพยาบาลสังกัดในสิทธิ์ของคุณ' });
        }

        // ค้นหาคำขอที่ 'to_hospital' (ผู้ขอยืม) ตรงกับ รพ. ของเรา = คำขอที่เราส่งออกไปเอง
        const outboxTransfers = await TransferRequest.find({ to_hospital: myHospitalId })
            .populate('from_hospital', 'hospital_id hospital_name hospital_type') // รพ. ต้นทางที่เราขอยืม
            .populate('drug_ref', 'drug_id generic_name trade_name category')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: outboxTransfers.length,
            data: outboxTransfers
        });

    } catch (error) {
        console.error('❌ Get outgoing transfers error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// @desc    สร้างใบคำขอยืมยาใหม่ (Page 4 - New Request)
// @route   POST /api/transfers
const createTransferRequest = async (req, res) => {
    try {
        // 🔧 [แก้ไข] ผู้ใช้งานที่ Login เป็นฝั่ง "ผู้ขอยืม" (to_hospital) เสมอ
        // ส่วน "ผู้ให้ยืม" (from_hospital) ต้องให้หน้าบ้านเลือกและส่งมาเอง เพราะ
        // ทุก รพ. สามารถขอยืมจาก รพ. อื่นได้อย่างอิสระ ไม่ตายตัวว่าใครเป็นผู้ให้ยืม
        const { from_hospital, drug_ref, quantity_requested } = req.body;

        const created_by = req.user?._id;
        const to_hospital = req.user?.hospital_id; // 👈 รพ. ของผู้ขอยืม มาจาก Token เสมอ

        if (!from_hospital || !drug_ref || !quantity_requested) {
            return res.status(400).json({
                success: false,
                message: 'กรุณาระบุโรงพยาบาลต้นทาง (from_hospital), drug_ref และ quantity_requested ให้ครบถ้วน'
            });
        }

        // คำนวณวันกำหนดคืนอัตโนมัติ (คืนภายใน 30 วัน)
        const return_due_date = new Date();
        return_due_date.setDate(return_due_date.getDate() + 30);

        // บันทึกลงฐานข้อมูล โดยใช้ to_hospital ที่ระบบดึงมาให้เอง และ from_hospital ที่หน้าบ้านเลือก
        const newRequest = await TransferRequest.create({
            from_hospital, // 👈 รพ. ต้นทาง/ผู้ให้ยืม ที่ผู้ใช้เลือกจากหน้าฟอร์ม
            to_hospital,   // 👈 รพ. ของผู้ใช้งานที่ Login อยู่ (ผู้ขอยืม)
            drug_ref,
            created_by,
            quantity_requested,
            return_due_date
        });

        // แตกข้อมูลผูกความสัมพันธ์ออกมาโชว์ให้หน้าบ้าน
        const populatedRequest = await TransferRequest.findById(newRequest._id)
            .populate('from_hospital', 'hospital_id hospital_name hospital_type') 
            .populate('to_hospital', 'hospital_id hospital_name hospital_type')
            .populate('drug_ref', 'drug_id generic_name trade_name category');

        return res.status(201).json({ success: true, data: populatedRequest });
    } catch (error) {
        console.error('❌ Create transfer request error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    อนุมัติใบคำขอยืมยา และรันระบบล็อกสต็อกแบบ Transaction ปลอดภัยสูง
// @route   PATCH /api/transfers/:id/approve
const approveTransferRequest = async (req, res) => {
    const { id } = req.params;
    const { quantity_approved } = req.body; // รองรับกรณีกด Partial Fulfillment (ขอ 5 อนุมัติ 3)
    const approved_by = req.user?._id || "64b5f9e2f1d2c3a4b5e6f7a9";

    // 1. เริ่มเปิดใช้งาน Session สำหรับทำ Transaction
    const session = await mongoose.startSession();
    
    try {
        let updatedRequest = null;

        // 2. ครอบการทำงานทั้งหมดด้วย withTransaction
        await session.withTransaction(async () => {
            
            // 2.1 ค้นหาใบคำขอและตรวจสอบว่ายังเป็น PENDING อยู่ไหม
            const transferRequest = await TransferRequest.findById(id).session(session);
            if (!transferRequest || transferRequest.status !== 'PENDING') {
                throw new Error('คำขอนี้ถูกดำเนินการไปแล้ว หรือไม่พบข้อมูลในระบบ');
            }

            const qty = quantity_approved || transferRequest.quantity_requested;
            const fromHospital = transferRequest.from_hospital;
            const drugId = transferRequest.drug_ref;

            // 2.2 ตรวจสอบสต็อกจริงของ รพ. ต้นทาง (ผู้ให้ยืม)
            const donorStock = await Inventory.findOne({ hospital_ref: fromHospital, drug_ref: drugId }).session(session);
            if (!donorStock || donorStock.available_quantity < qty) {
                throw new Error('โรงพยาบาลต้นทางมีปริมาณยาพร้อมให้ยืมไม่เพียงพอ');
            }

            // 2.3 [รันคีย์เวิร์ด MVP-14]: ตัดสต็อกและล็อกยอดแบบเป็นกลุ่ม (Atomic Update)
            await Inventory.updateOne(
                { hospital_ref: fromHospital, drug_ref: drugId },
                { 
                    $inc: { 
                        available_quantity: -qty, // หักออกจากคลังที่พร้อมปล่อยยืม
                        reserved_quantity: qty     // เอามาพักล็อคไว้ รอรถขนส่งมารับ
                    } 
                },
                { session }
            );

            // 2.4 อัปเดตสถานะใบคำขอเป็น APPROVED ลงในคอลเลกชัน Transfers ด้วย .findOneAndUpdate()
            updatedRequest = await TransferRequest.findByIdAndUpdate(
                id,
                {
                    status: 'APPROVED',
                    quantity_approved: qty,
                    approved_by: approved_by
                },
                { new: true, session }
            );

            // 2.5 สร้างเอกสารใบสั่งจัดส่งสินค้า (DELIVERY) สถานะเริ่มต้น DISPATCHED รอรถพยาบาลวิ่ง
            await Delivery.create([{
                request_ref: id,
                ems_unit_name: "Ambulance Zone 8 / UD-01", // ค่าจำลองเริ่มต้น
                delivery_status: 'DISPATCHED'
            }], { session });

        });

        // 3. ปิด Session เมื่อ Transaction ทำงานสำเร็จลุล่วงครบทุกบรรทัด
        session.endSession();
        return res.status(200).json({ success: true, message: 'อนุมัติและล็อกสต็อกยาสำเร็จ', data: updatedRequest });

    } catch (error) {
        // หากเกิด Error ตรงบรรทัดไหน ข้อมูลทั้งหมดจะถูก Rollback สต็อกจะไม่เพี้ยน
        session.endSession();
        console.error('❌ Transaction Approved Error:', error.message);
        return res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    ปฏิเสธใบคำขอยืมยา (ไม่ต้องหักสต็อก)
// @route   PATCH /api/transfers/:id/reject
const rejectTransferRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body; // บังคับกรอกเหตุผลตามสเปก

        if (!rejection_reason) {
            return res.status(400).json({ success: false, message: 'จำเป็นต้องกรอกเหตุผลในการปฏิเสธคำขอ' });
        }

        // อัปเดตสถานะเป็น REJECTED และแนบเหตุผล
        const updatedRequest = await TransferRequest.findByIdAndUpdate(
            id,
            {
                status: 'REJECTED',
                rejection_reason: rejection_reason
            },
            { new: true } // เพื่อให้ส่งค่าเวอร์ชันที่อัปเดตล่าสุดกลับไปให้ Frontend
        );

        if (!updatedRequest) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบคำขอนี้ในระบบ' });
        }

        return res.status(200).json({ success: true, message: 'ปฏิเสธคำขอยืมยาเรียบร้อย', data: updatedRequest });
    } catch (error) {
        console.error('❌ Reject transfer request error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = {
    createTransferRequest,
    approveTransferRequest,
    rejectTransferRequest,
    getIncomingTransfers,
    getOutgoingTransfers
};