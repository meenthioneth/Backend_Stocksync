const mongoose = require('mongoose');
const dotenv = require('dotenv');

// ⚙️ โหลดโมเดลทั้งหมดมาทำงานพร้อมกัน
const Inventory = require('./models/Inventory');
const TransferRequest = require('./models/TransferRequest');
const DrugUsageRate = require('./models/DrugUsageRate'); // 🌟 โหลดโมเดลใหม่ที่เพิ่งสร้าง

dotenv.config();

// ข้อมูลดิบจากไฟล์ระบบจริงของคุณ
const hospitals = [
    { id: "6a2d572f841af787a2121ff4", name: "รพ.อุดรธานี (รพ.ศูนย์)", type: "A" },
    { id: "6a2d5730841af787a2121ff5", name: "รพ.กุมภวาปี", type: "F1" },
    { id: "6a2d5730841af787a2121ff6", name: "รพ.บ้านผือ", type: "F1" },
    { id: "6a2d5730841af787a2121ff7", name: "รพ.หนองหาน", type: "F2" },
    { id: "6a2d5730841af787a2121ff8", name: "รพ.เพ็ญ", type: "F2" },
    { id: "6a2d5730841af787a2121ff9", name: "รพ.บ้านดุง", type: "F1" },
    { id: "6a2d5730841af787a2121ffa", name: "รพ.ศรีธาตุ", type: "F2" },
    { id: "6a2d5730841af787a2121ffb", name: "รพ.น้ำโสม", type: "F2" },
    { id: "6a2d5730841af787a2121ffc", name: "รพ.โนนสะอาด", type: "F2" },
    { id: "6a2d5730841af787a2121ffd", name: "รพ.สร้างคอม", type: "F3" },
    { id: "6a2d5730841af787a2121ffe", name: "รพ.หนองวัวซอ", type: "F2" },
    { id: "6a2d5730841af787a2121fff", name: "รพ.วังสามหมอ", type: "F2" },
    { id: "6a2d5730841af787a2122000", name: "รพ.ทุ่งฝน", type: "F3" },
    { id: "6a2d5730841af787a2122001", name: "รพ.ไชยวาน", type: "F3" },
    { id: "6a2d5730841af787a2122002", name: "รพ.กุดจับ", type: "F2" }
];

const drugs = [
    { id: "6a2d5730841af787a2122003", name: "Tenecteplase", condition: "Cold Chain 2-8°C" },
    { id: "6a2d5730841af787a2122004", name: "Norepinephrine", condition: "Room Temp" },
    { id: "6a2d5730841af787a2122005", name: "Morphine Sulfate", condition: "Room Temp" },
    { id: "6a2d5730841af787a2122006", name: "Aspirin", condition: "Room Temp" },
    { id: "6a2d5730841af787a2122007", name: "Clopidogrel", condition: "Room Temp" },
    { id: "6a2d5730841af787a2122008", name: "Insulin Human", condition: "Cold Chain 2-8°C" }
];

const users = [
    "6a3a77ba4213259fce45e68e", "6a3a77ba4213259fce45e68f",
    "6a3a77ba4213259fce45e692", "6a3a77ba4213259fce45e696",
    "6a3a77ba4213259fce45e69e", "6a3a77ba4213259fce45e6a2"
];

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stocksync');
        console.log('🔌 Connected to MongoDB...');

        // ล้างข้อมูลเก่าของทั้ง 3 ตาราง
        await Inventory.deleteMany();
        await DrugUsageRate.deleteMany();
        await TransferRequest.deleteMany();
        console.log('🧹 Cleared old data...');

        const inventoryData = [];
        const usageRateData = [];

        // ------------------------------------------
        // 📈 LOOP 1: วนลูปสร้าง Inventory และ ตารางใหม่ DrugUsageRate ควบคู่กัน (รวม 90 รายการคู่)
        // ------------------------------------------
        hospitals.forEach((hosp) => {
            drugs.forEach((drug) => {
                // 1. ส่วนคำนวณอัตราใช้ยา (DrugUsageRate)
                let avgUsage = 0;
                let intensity = 'MEDIUM';
                
                if (hosp.type === "A") {
                    avgUsage = getRandomInt(120, 240);
                    intensity = 'HIGH';
                } else if (["F1", "F2"].includes(hosp.type)) {
                    avgUsage = getRandomInt(35, 85);
                    intensity = 'MEDIUM';
                } else {
                    avgUsage = getRandomInt(5, 20);
                    intensity = 'LOW';
                }
                const currentMonthUsage = Math.floor(avgUsage * (getRandomInt(50, 90) / 100));

                usageRateData.push({
                    hospital_ref: hosp.id,
                    drug_ref: drug.id,
                    average_monthly_usage: avgUsage,
                    current_month_usage: currentMonthUsage,
                    demand_intensity: intensity
                });

                // 2. ส่วนคำนวณคลังสินค้า (Inventory)
                let baseQty = Math.floor(avgUsage * getRandomInt(2, 4)); // ให้มีสต็อกเหลือพอใช้ 2-4 เดือน
                const safetyStock = Math.floor(baseQty * 0.2);
                const reserved = getRandomInt(0, 5);
                const available = baseQty - reserved;

                const lots = [];
                const normalExpiry = new Date();
                normalExpiry.setMonth(normalExpiry.getMonth() + getRandomInt(12, 24));
                
                const nearExpiry = new Date();
                nearExpiry.setMonth(nearExpiry.getMonth() + getRandomInt(1, 3)); // มีล็อตเสี่ยงหมดอายุ

                const qtyLot1 = Math.floor(baseQty * 0.7);
                const qtyLot2 = baseQty - qtyLot1;

                lots.push({
                    lot_number: `LOT-${getRandomInt(66, 69)}${getRandomInt(1000, 9999)}`,
                    expiry_date: normalExpiry,
                    quantity_in_lot: qtyLot1
                });

                if (qtyLot2 > 0) {
                    lots.push({
                        lot_number: `LOT-EXP-${getRandomInt(1000, 9999)}`,
                        expiry_date: nearExpiry,
                        quantity_in_lot: qtyLot2
                    });
                }

                inventoryData.push({
                    hospital_ref: hosp.id,
                    drug_ref: drug.id,
                    quantity: baseQty,
                    available_quantity: available,
                    reserved_quantity: reserved,
                    safety_stock_level: safetyStock,
                    ward_location: getRandomInt(0, 1) === 1 ? "คลังยาหลักกลาง" : "ห้องจ่ายยาฉุกเฉิน ER",
                    storage_condition: drug.condition,
                    lots: lots
                });
            });
        });

        // ------------------------------------------
        // 📊 LOOP 2: วนลูปเจนประวัติใบยืมยาเดิม (TransferRequest) จำนวน 60 รายการย้อนหลัง
        // ------------------------------------------
        const transfersData = [];
        const statuses = ['PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED'];

        for (let i = 0; i < 60; i++) {
            const fromHosp = hospitals[getRandomInt(0, hospitals.length - 1)];
            let toHosp = hospitals[getRandomInt(0, hospitals.length - 1)];
            while (toHosp.id === fromHosp.id) {
                toHosp = hospitals[getRandomInt(0, hospitals.length - 1)];
            }

            const randomDrug = drugs[getRandomInt(0, drugs.length - 1)];
            const status = statuses[getRandomInt(0, statuses.length - 1)];
            const qtyRequested = getRandomInt(5, 35);

            let qtyApproved = 0;
            let approvedBy = null;
            let rejectionReason = '';
            let returnStatus = 'PENDING';

            if (['APPROVED', 'IN_TRANSIT', 'COMPLETED'].includes(status)) {
                qtyApproved = getRandomInt(0, 1) === 1 ? qtyRequested : qtyRequested - getRandomInt(1, 3);
                approvedBy = users[getRandomInt(0, users.length - 1)];
            }
            if (status === 'REJECTED') rejectionReason = 'บุคลากรตรวจสอบแล้วไม่พบจำนวนคงเหลือที่สามารถแบ่งยืมได้';
            if (status === 'COMPLETED' && getRandomInt(0, 1) === 1) returnStatus = 'RETURNED';

            const createdDate = new Date();
            createdDate.setDate(createdDate.getDate() - getRandomInt(1, 45));
            const dueDate = new Date(createdDate);
            dueDate.setDate(dueDate.getDate() + 30);

            transfersData.push({
                from_hospital: fromHosp.id,
                to_hospital: toHosp.id,
                drug_ref: randomDrug.id,
                created_by: users[getRandomInt(0, users.length - 1)],
                approved_by: approvedBy,
                quantity_requested: qtyRequested,
                quantity_approved: qtyApproved,
                status: status,
                return_due_date: dueDate,
                return_status: returnStatus,
                rejection_reason: rejectionReason,
                createdAt: createdDate,
                updatedAt: createdDate
            });
        }

        // เซฟข้อมูลทั้งหมดเข้าสู่ฐานข้อมูลแยกตาราง
        await Inventory.insertMany(inventoryData);
        console.log(`📦 1. เจนข้อมูลคลังยา (Inventory) สำเร็จ: ${inventoryData.length} รายการ`);

        await DrugUsageRate.insertMany(usageRateData);
        console.log(`📈 2. เจนข้อมูลโมเดลใหม่ อัตราการใช้ยา (DrugUsageRate) สำเร็จ: ${usageRateData.length} รายการ`);

        await TransferRequest.insertMany(transfersData);
        console.log(`✅ 3. เจนสุ่มประวัติใบคำขอยืมยาเดิม (TransferRequest) สำเร็จ: ${transfersData.length} รายการย้อนหลัง`);

        console.log('🎉 [StockSync] All 3 Tables Seeded and Sync Process Finished Successfully!');
        process.exit();
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedDatabase();