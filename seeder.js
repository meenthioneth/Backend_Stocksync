const mongoose = require('mongoose');
const dotenv = require('dotenv');

// โหลดโมเดลทั้งหมดมาทำงานร่วมกัน
const Inventory = require('./models/Inventory');
const TransferRequest = require('./models/TransferRequest');
const DrugUsageRate = require('./models/DrugUsageRate');
const BloodInventory = require('./models/BloodInventory'); // 🌟 เรียกใช้โมเดลตารางเลือดที่แยกใหม่

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

// ข้อมูลตั้งต้นสำหรับกลุ่มและองค์ประกอบของเลือด
const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const componentTypes = ['PRC', 'FFP', 'PLT']; // PRC=เม็ดเลือดแดงเข้มข้น, FFP=พลาสมาสดแช่แข็ง, PLT=เกล็ดเลือด

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stocksync');
        console.log('🔌 Connected to MongoDB...');

        // 🧹 เคลียร์ข้อมูลเก่าทั้งหมดรวมถึงตารางเลือดใหม่ด้วย
        await Inventory.deleteMany();
        await DrugUsageRate.deleteMany();
        await TransferRequest.deleteMany();
        await BloodInventory.deleteMany(); 
        console.log('🧹 Cleared old data (Inventory, UsageRates, BloodInventory)...');

        const inventoryData = [];
        const usageRateData = [];
        const bloodInventoryData = [];

        // =============================================================
        // PART 1: จัดการข้อมูลฝั่ง "ยา" (เหมือนระบบเดิมที่กระจายตัวแล้ว)
        // =============================================================
        hospitals.forEach((hosp) => {
            drugs.forEach((drug) => {
                let avgUsage = 0;
                let intensity = 'MEDIUM';
                
                if (hosp.type === "A") {
                    avgUsage = getRandomInt(150, 250);
                    intensity = 'HIGH';
                } else if (hosp.type === "F1") {
                    avgUsage = getRandomInt(80, 140);
                    intensity = 'HIGH';
                } else if (hosp.type === "F2") {
                    avgUsage = getRandomInt(30, 75);
                    intensity = 'MEDIUM';
                } else {
                    avgUsage = getRandomInt(5, 25);
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

                let baseQty = 0;
                const lots = [];

                // ล็อตยาปลอดภัย (18-24 เดือน)
                const normalExpiry = new Date();
                normalExpiry.setMonth(normalExpiry.getMonth() + getRandomInt(18, 24));
                const qtyNormal = getRandomInt(20, 100);
                lots.push({
                    lot_number: `LOT-NM-${getRandomInt(1000, 9999)}`,
                    expiry_date: normalExpiry,
                    quantity_in_lot: qtyNormal
                });
                baseQty += qtyNormal;

                // ล็อตยากลางๆ (5-6 เดือน)
                if (getRandomInt(1, 10) > 4) {
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

                // ล็อตยาวิกฤต (1-2 เดือนใกล้หมดอายุ)
                if (getRandomInt(1, 10) > 3) {
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

                const safetyStock = Math.floor(avgUsage * 0.4); 
                let availableQty = baseQty;
                if (getRandomInt(1, 10) > 7) { 
                    availableQty = getRandomInt(1, Math.max(2, safetyStock - 1)); // สต็อกวิกฤตขาดแคลน
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

            // =============================================================
            // PART 2: 🩸 จัดการข้อมูลฝั่ง "คลังเลือด" แยกตาราง (BloodInventory)
            // =============================================================
            bloodGroups.forEach((group) => {
                componentTypes.forEach((compType) => {
                    const bloodLots = [];
                    let totalUnits = 0;

                    // 1. ล็อตเลือดปกติ (ปลอดภัย อยู่ได้ตามเกณฑ์มาตรฐาน)
                    const normalBloodExp = new Date();
                    // เกล็ดเลือด (PLT) อยู่ได้สั้นมากสูงสุด 5 วัน ส่วน PRC/FFP อยู่ได้ราว 30 วัน
                    if (compType === 'PLT') {
                        normalBloodExp.setDate(normalBloodExp.getDate() + getRandomInt(4, 5));
                    } else {
                        normalBloodExp.setDate(normalBloodExp.getDate() + getRandomInt(25, 35));
                    }
                    const qtyNormalBlood = getRandomInt(5, 15);
                    bloodLots.push({
                        bag_number: `BAG-${group.replace('+', 'P').replace('-', 'M')}-${getRandomInt(1000, 9999)}`,
                        expiry_date: normalBloodExp,
                        quantity_in_bag: qtyNormalBlood
                    });
                    totalUnits += qtyNormalBlood;

                    // 2. ล็อตเลือดวิกฤต ⏳ ใกล้หมดอายุค้างตู้ (ติดเกณฑ์ AI แนะนำกระจายเลือดด่วน)
                    // สุ่มให้เกิดขึ้น 65% ในระบบเพื่อความกระจายตัวของข้อมูลแผนที่
                    if (getRandomInt(1, 10) > 3) {
                        const criticalBloodExp = new Date();
                        if (compType === 'PLT') {
                            criticalBloodExp.setDate(criticalBloodExp.getDate() + getRandomInt(1, 2)); // เหลือ 1-2 วัน
                        } else {
                            criticalBloodExp.setDate(criticalBloodExp.getDate() + getRandomInt(2, 5)); // เหลือ 2-5 วัน
                        }
                        const qtyCriticalBlood = getRandomInt(2, 8);
                        bloodLots.push({
                            bag_number: `BAG-EXP-${getRandomInt(1000, 9999)}`,
                            expiry_date: criticalBloodExp,
                            quantity_in_bag: qtyCriticalBlood
                        });
                        totalUnits += qtyCriticalBlood;
                    }

                    // 3. กำหนดเกณฑ์ปลอดภัย (Safety Stock ของคลังเลือด)
                    // รพ. ศูนย์ (Type A) ความต้องการใช้เลือดผ่าตัดสูง เกณฑ์จะสูงกว่า รพ. อำเภอเล็ก
                    let safetyLevel = 4;
                    if (hosp.type === "A") safetyLevel = 15;
                    else if (hosp.type === "F1") safetyLevel = 8;

                    // 4. สุ่มสร้างภาวะ 🚨 "เลือดหมดตู้ฉุกเฉิน" (Available ต่ำกว่าเกณฑ์ความปลอดภัย)
                    let availableUnits = totalUnits;
                    if (getRandomInt(1, 10) > 7) {
                        availableUnits = getRandomInt(0, Math.max(1, safetyLevel - 1)); // จงใจทำให้เลือดขาดตู้
                    }

                    bloodInventoryData.push({
                        hospital_ref: hosp.id,
                        blood_group: group,
                        component_type: compType,
                        available_units: availableUnits,
                        safety_unit_level: safetyLevel,
                        lots: bloodLots
                    });
                });
            });
        });

        // บันทึกทั้งหมดเข้าฐานข้อมูล
        await Inventory.insertMany(inventoryData);
        await DrugUsageRate.insertMany(usageRateData);
        await BloodInventory.insertMany(bloodInventoryData); // 🌟 ยิงเข้าคอลเลกชันเลือดแยกก้อนสถาปัตยกรรมใหม่

        console.log(`📦 Reshaped Drug Inventory Count: ${inventoryData.length} records.`);
        console.log(`📈 Reshaped Drug Usage Rates Count: ${usageRateData.length} records.`);
        console.log(`🩸 NEW: Blood Inventory Count: ${bloodInventoryData.length} records separate seeded.`);
        console.log('🎉 [All Data Distributed Successfully] ข้อมูลถูกกระจายแยกตาราง ยา-เลือด พร้อมสำหรับรัน Frontend แล้วครับ!');
        process.exit();
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedDatabase();