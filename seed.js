const mongoose = require('mongoose');
require('dotenv').config();

// ดึง Models มาใช้งาน
const Hospital = require('./models/Hospital');
const Drug = require('./models/Drug');
const Inventory = require('./models/Inventory');

// 1. เพิ่มข้อมูลโรงพยาบาลจำลอง 15 แห่ง ทั่วจังหวัดอุดรธานี (พิกัดและอำเภอจริง)
const mockHospitals = [
  { hospital_id: "H10664", hospital_name: "รพ.อุดรธานี (รพ.ศูนย์)", hospital_type: "A", location: { type: "Point", coordinates: [102.7874, 17.4139] }, health_zone: 8, network_group_id: "UD-CENTRAL" },
  { hospital_id: "H11042", hospital_name: "รพ.กุมภวาปี", hospital_type: "F1", location: { type: "Point", coordinates: [102.9754, 17.1162] }, health_zone: 8, network_group_id: "UD-SOUTH" },
  { hospital_id: "H11043", hospital_name: "รพ.บ้านผือ", hospital_type: "F1", location: { type: "Point", coordinates: [102.4831, 17.6845] }, health_zone: 8, network_group_id: "UD-WEST" },
  { hospital_id: "H11044", hospital_name: "รพ.หนองหาน", hospital_type: "F2", location: { type: "Point", coordinates: [103.1118, 17.3621] }, health_zone: 8, network_group_id: "UD-EAST" },
  { hospital_id: "H11045", hospital_name: "รพ.เพ็ญ", hospital_type: "F2", location: { type: "Point", coordinates: [102.7912, 17.6942] }, health_zone: 8, network_group_id: "UD-NORTH" },
  { hospital_id: "H11046", hospital_name: "รพ.บ้านดุง", hospital_type: "F1", location: { type: "Point", coordinates: [103.2594, 17.6872] }, health_zone: 8, network_group_id: "UD-NORTH-EAST" },
  { hospital_id: "H11047", hospital_name: "รพ.ศรีธาตุ", hospital_type: "F2", location: { type: "Point", coordinates: [103.2201, 16.9984] }, health_zone: 8, network_group_id: "UD-SOUTH-EAST" },
  { hospital_id: "H11048", hospital_name: "รพ.น้ำโสม", hospital_type: "F2", location: { type: "Point", coordinates: [102.1895, 17.7712] }, health_zone: 8, network_group_id: "UD-NORTH-WEST" },
  { hospital_id: "H11049", hospital_name: "รพ.โนนสะอาด", hospital_type: "F2", location: { type: "Point", coordinates: [102.9048, 16.9092] }, health_zone: 8, network_group_id: "UD-SOUTH" },
  { hospital_id: "H11050", hospital_name: "รพ.สร้างคอม", hospital_type: "F3", location: { type: "Point", coordinates: [103.0901, 17.7423] }, health_zone: 8, network_group_id: "UD-NORTH" },
  { hospital_id: "H11051", hospital_name: "รพ.หนองวัวซอ", hospital_type: "F2", location: { type: "Point", coordinates: [102.5694, 17.1512] }, health_zone: 8, network_group_id: "UD-WEST" },
  { hospital_id: "H11052", hospital_name: "รพ.วังสามหมอ", hospital_type: "F2", location: { type: "Point", coordinates: [103.4412, 16.8924] }, health_zone: 8, network_group_id: "UD-SOUTH-EAST" },
  { hospital_id: "H11053", hospital_name: "รพ.ทุ่งฝน", hospital_type: "F3", location: { type: "Point", coordinates: [103.2524, 17.4715] }, health_zone: 8, network_group_id: "UD-EAST" },
  { hospital_id: "H11054", hospital_name: "รพ.ไชยวาน", hospital_type: "F3", location: { type: "Point", coordinates: [103.2384, 17.2819] }, health_zone: 8, network_group_id: "UD-EAST" },
  { hospital_id: "H11055", hospital_name: "รพ.กุดจับ", hospital_type: "F2", location: { type: "Point", coordinates: [102.5645, 17.4241] }, health_zone: 8, network_group_id: "UD-WEST" }
];

// 2. เพิ่มรายการยาจำลองคละหมวดหมู่ (6 รายการ)
const mockDrugs = [
  { drug_id: "TMT-224105", generic_name: "Tenecteplase 50mg Injection", trade_name: "TNKase", category: "High-Alert Emergency" },
  { drug_id: "TMT-554312", generic_name: "Norepinephrine 4mg/4mL Injection", trade_name: "Levophed", category: "High-Alert Emergency" },
  { drug_id: "TMT-112233", generic_name: "Morphine Sulfate 10mg/mL Injection", trade_name: "Morphine", category: "High-Alert Emergency" },
  { drug_id: "TMT-109845", generic_name: "Aspirin 81mg Tablet", trade_name: "Bayer Aspirin", category: "General" },
  { drug_id: "TMT-994321", generic_name: "Clopidogrel 75mg Tablet", trade_name: "Plavix", category: "General" },
  { drug_id: "TMT-445566", generic_name: "Insulin Human Soluble 100 IU/mL", trade_name: "Actrapid", category: "General" }
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🌱 Connected to MongoDB for heavy seeding...");

    // ล้างข้อมูลเก่า
    await Hospital.deleteMany({});
    await Drug.deleteMany({});
    await Inventory.deleteMany({});
    console.log("🗑️ Cleared existing database records.");

    // ใส่ข้อมูลหลัก
    const createdHospitals = await Hospital.insertMany(mockHospitals);
    const createdDrugs = await Drug.insertMany(mockDrugs);
    console.log(`🏢 Seeded ${createdHospitals.length} Hospitals successfully.`);
    console.log(`💊 Seeded ${createdDrugs.length} Master Drugs successfully.`);

    const inventoryItems = [];

    // วนลูปสร้างคลังยาแบบสุ่มสถานะ เพื่อให้แสดงผลบนแผนที่ (Page 2) มีความหลากหลาย
    for (const hospital of createdHospitals) {
      for (const drug of createdDrugs) {
        
        const isEmergency = drug.category === "High-Alert Emergency";
        const safetyLevel = isEmergency ? 5 : 20;
        
        let availableQty = 0;
        let reservedQty = 0;

        // แยก Logic ตามขนาดโรงพยาบาลและสุ่มสถานะสต็อก
        if (hospital.hospital_type === "A") {
          // รพ.ศูนย์ขนาดใหญ่: ยาแน่นคลังเสมอ (หมุดเขียว)
          availableQty = isEmergency ? 60 : 250;
        } else {
          // รพ.ชุมชนรอบนอก: สุ่มสถานะยาให้เกิดเคสที่หลากหลายสำหรับเทสระบบ
          const randomSeed = Math.random();

          if (randomSeed < 0.35) {
            // 🟥 เคสที่ 1: ยาวิกฤตต่ำกว่าเกณฑ์ความปลอดภัย (Critical Stock) -> หมุดแดงบนแผนที่
            availableQty = Math.floor(Math.random() * (safetyLevel - 1)) + 1; // มีค่าน้อยกว่า Safety Stock
          } else if (randomSeed < 0.65) {
            // 🟨 เคสที่ 2: ยาใกล้หมดเตือนล่วงหน้า (Warning) -> หมุดเหลืองบนแผนที่
            availableQty = Math.floor(Math.random() * (safetyLevel * 0.5)) + safetyLevel; // เกินมานิดหน่อย
          } else {
            // 🟩 เคสที่ 3: สต็อกปกติสุข -> หมุดเขียวบนแผนที่
            availableQty = isEmergency ? 15 : 80;
          }

          // สุ่มให้บางแห่งติดสถานะกำลังขนส่ง (มี Reserved) เพื่อเทสเคส Double Booking
          if (Math.random() > 0.8) {
            reservedQty = isEmergency ? 2 : 10;
          }
        }

        // สร้างล็อตยา (FEFO) คละวันหมดอายุ
        const mockLots = [
          {
            lot_number: `LOT-${drug.drug_id.split('-')[1]}-A`,
            expiry_date: new Date(Date.now() + (Math.floor(Math.random() * 100) + 30) * 24 * 60 * 60 * 1000), // หมดอายุใน 30-130 วันข้างหน้า
            quantity_in_lot: Math.floor(availableQty * 0.4)
          },
          {
            lot_number: `LOT-${drug.drug_id.split('-')[1]}-B`,
            expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // หมดอายุปีหน้า
            quantity_in_lot: (availableQty + reservedQty) - Math.floor(availableQty * 0.4)
          }
        ];

        inventoryItems.push({
          hospital_ref: hospital._id,
          drug_ref: drug._id,
          quantity: availableQty + reservedQty,
          available_quantity: availableQty,
          reserved_quantity: reservedQty,
          safety_stock_level: safetyLevel,
          ward_location: isEmergency ? "ER Crash Cart ชั้น 1" : "ห้องคลังใหญ่ตึกเภสัชกรรม",
          storage_condition: isEmergency ? "Cold Chain 2-8°C" : "Room Temp",
          lots: mockLots
        });
      }
    }

    // ยิงข้อมูลคลังยาทั้งหมดเข้า MongoDB รวดเดียว
    await Inventory.insertMany(inventoryItems);
    console.log(`📦 Seeded ${inventoryItems.length} network inventory stock records.`);
    console.log("🚀 [READY] MongoDB has been loaded with complete realistic dataset!");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedDatabase();