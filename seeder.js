const mongoose = require('mongoose');
const dotenv = require('dotenv');

// โหลดโมเดลทั้งหมดมาทำงานร่วมกัน
const Inventory = require('./models/Inventory');
const TransferRequest = require('./models/TransferRequest');
const DrugUsageRate = require('./models/DrugUsageRate');

dotenv.config();

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

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stocksync');
        console.log('🔌 Connected to MongoDB...');

        await Inventory.deleteMany();
        await DrugUsageRate.deleteMany();
        await TransferRequest.deleteMany();
        console.log('🧹 Cleared old data for reshaping...');

        const inventoryData = [];
        const usageRateData = [];

        // -------------------------------------------------------------
        // LOOP 1: เจนสถิติการใช้ยาและคลังสินค้าแบบกระจายตัวแปรครอบคลุม
        // -------------------------------------------------------------
        hospitals.forEach((hosp) => {
            drugs.forEach((drug) => {
                
                // 📊 1. ออกแบบข้อมูลความต้องการ (DrugUsageRate) ให้เฉลี่ยหลากหลาย
                let avgUsage = 0;
                let intensity = 'MEDIUM';
                
                if (hosp.type === "A") {
                    avgUsage = getRandomInt(150, 250); // รพ. ศูนย์ (ยังคงเยอะสุดตามจริง)
                    intensity = 'HIGH';
                } else if (hosp.type === "F1") {
                    avgUsage = getRandomInt(80, 140);  // รพ. อำเภอใหญ่ (มีโอกาสติดอันดับ AI Match แข่งกับ รพ.ศูนย์)
                    intensity = 'HIGH';
                } else if (hosp.type === "F2") {
                    avgUsage = getRandomInt(30, 75);   // รพ. อำเภอกลาง
                    intensity = 'MEDIUM';
                } else {
                    avgUsage = getRandomInt(5, 25);    // รพ. อำเภอเล็ก
                    intensity = 'LOW';
                }

                const currentMonthUsage = Math.floor(avgUsage * (getRandomInt(60, 95) / 100));

                usageRateData.push({
                    hospital_ref: hosp.id,
                    drug_ref: drug.id,
                    average_monthly_usage: avgUsage,
                    current_month_usage: currentMonthUsage,
                    demand_intensity: intensity
                });

                // 📦 2. ออกแบบคลังเวชภัณฑ์ (Inventory) ให้มีวันหมดอายุหลากหลายล็อตต่อตัวยา
                // เพื่อให้มีทั้งล็อตวิกฤต ล็อตปานกลาง และล็อตปลอดภัย
                let baseQty = 0;
                const lots = [];

                // ล็อต 1: ปลอดภัยสูง (หมดอายุอีก 18-24 เดือนข้างหน้า)
                const normalExpiry = new Date();
                normalExpiry.setMonth(normalExpiry.getMonth() + getRandomInt(18, 24));
                const qtyNormal = getRandomInt(20, 100);
                lots.push({
                    lot_number: `LOT-NM-${getRandomInt(1000, 9999)}`,
                    expiry_date: normalExpiry,
                    quantity_in_lot: qtyNormal
                });
                baseQty += qtyNormal;

                // ล็อต 2: ปานกลาง (หมดอายุอีก 5-6 เดือนข้างหน้า -> รอดเกณฑ์สแกน 90 วัน)
                if (getRandomInt(1, 10) > 4) { // สุ่มให้เกิด 60% ของคลังสินค้าทั้งหมด
                    const midExpiry = new Date();
                    midExpiry.setMonth(midExpiry.getMonth() + getRandomInt(5, 6));
                    const qtyMid = getRandomInt(15, 40);
                    lots.push({
                        lot_number: `LOT-MID-${getRandomInt(1000, 9999)}`,
                        expiry_date: midExpiry,
                        quantity_in_lot: qtyMid
                    });
                    baseQty += qtyMid;
                }

                // ล็อต 3: 🚨 วิกฤตใกล้หมดอายุ (หมดอายุภายใน 1-3 เดือนข้างหน้า -> ติดสแกน AI)
                // สุ่มให้กระจายพุ่งกระจายตัวทั่วโรงพยาบาลต่างๆ
                if (getRandomInt(1, 10) > 3) { // สุ่มให้เกิดในสัดส่วน 70% เพื่อเพิ่มจำนวนการแจ้งเตือนบนหน้าเว็บ
                    const criticalExpiry = new Date();
                    criticalExpiry.setMonth(criticalExpiry.getMonth() + getRandomInt(1, 2));
                    criticalExpiry.setDate(criticalExpiry.getDate() + getRandomInt(1, 20));
                    
                    const qtyCritical = getRandomInt(10, 50);
                    lots.push({
                        lot_number: `LOT-EXP-${getRandomInt(1000, 9999)}`,
                        expiry_date: criticalExpiry,
                        quantity_in_lot: qtyCritical
                    });
                    baseQty += qtyCritical;
                }

                // ตั้งเกณฑ์วิกฤตสต็อกยาขาด (Safety Stock)
                const safetyStock = Math.floor(avgUsage * 0.4); 
                
                // สุ่มสร้างสถานะ "สต็อกขาดคลังฉุกเฉิน" สลับกันไปเพื่อให้ปักหมุดสีแดงได้ทั่วถึงบนแผนที่
                let availableQty = baseQty;
                if (getRandomInt(1, 10) > 7) { 
                    availableQty = getRandomInt(1, Math.max(2, safetyStock - 1)); // จงใจทำให้ต่ำกว่าเกณฑ์ความปลอดภัย
                }

                inventoryData.push({
                    hospital_ref: hosp.id,
                    drug_ref: drug.id,
                    quantity: baseQty,
                    available_quantity: availableQty,
                    reserved_quantity: getRandomInt(0, 4),
                    safety_stock_level: safetyStock,
                    ward_location: getRandomInt(0, 1) === 1 ? "คลังยาหลักกลาง" : "ห้องจ่ายยาฉุกเฉิน ER",
                    storage_condition: drug.condition,
                    lots: lots
                });
            });
        });

        // บันทึกทั้งหมดลงใน Database
        await Inventory.insertMany(inventoryData);
        await DrugUsageRate.insertMany(usageRateData);

        console.log(`📦 Reshaped Inventory Count: ${inventoryData.length} records populated.`);
        console.log(`📈 Reshaped Drug Usage Rates Count: ${usageRateData.length} records populated.`);
        console.log('🎉 [Data Distributed Successfully] ทดสอบยิง API ระบบสแกนและจัดกลุ่ม AI ได้เลยครับ!');
        process.exit();
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedDatabase();