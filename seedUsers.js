const mongoose = require('mongoose');
require('dotenv').config();

// ดึง Models มาใช้งาน (ตรวจสอบชื่อไฟล์ให้ตรงกับของคุณ)
const Hospital = require('./models/Hospital');
const User = require('./models/User'); 

const seedUsers = async () => {
  try {
    // 1. เชื่อมต่อฐานข้อมูล MongoDB Atlas
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🌱 Connected to MongoDB for seeding users...");

    // 2. ล้างข้อมูล User เก่าออกก่อนป้องกันข้อมูลซ้ำซ้อน
    await User.deleteMany({});
    console.log("🗑️ Cleared existing user records.");

    // 3. ดึงรายชื่อโรงพยาบาลทั้งหมดที่อยู่ในฐานข้อมูลขึ้นมาอ้างอิง
    const hospitals = await Hospital.find({});
    if (hospitals.length === 0) {
      console.log("❌ ไม่พบข้อมูลโรงพยาบาลในระบบ! กรุณารันสคริปต์ seed โรงพยาบาลก่อน");
      process.exit(1);
    }

    const mockUsers = [];

    // ชื่อ-นามสกุลจำลองสำหรับบุคลากรทางการแพทย์
    const firstNames = ["สมชาย", "สมหญิง", "ปิยะ", "อนันต์", "พรทิพย์", "นงลักษณ์", "วิชัย", "สุรพล", "จิราพร", "อัญชลี", "กิตติ", "นพดล", "ธนพล", "ศิริพร", "วรรณภา"];
    const lastNames = ["ใจดี", "รักชาติ", "พูนผล", "เจริญสุข", "มั่นคง", "แก้วมณี", "สมบูรณ์", "ทวีทรัพย์", "ศรีสุข", "รุ่งเรือง", "เลิศวิไล", "พานิช", "ตั้งใจ", "บริสุทธิ์", "สว่างจิต"];

    // 4. วนลูปสร้างบัญชีผู้ใช้งานให้ครบทุกโรงพยาบาล (แห่งละ 2 สิทธิ์)
    hospitals.forEach((hospital, index) => {
      // ดึงอักษรย่อหรือรหัสจากชื่อโรงพยาบาลมาทำเป็น Username ให้จำง่าย
      const rawId = hospital.hospital_id.toLowerCase(); // เช่น h11042
      const baseLastName = lastNames[index % lastNames.length];

      // บัญชีที่ 1: หัวหน้าเภสัชกร (Chief_Pharmacist) -> มีสิทธิ์ อนุมัติ/ปฏิเสธ ยา
      mockUsers.push({
        user_id: `USR-${hospital.hospital_id}-PHARM`,
        username: `pharm_${rawId}`, // เช่น pharm_h10664
        password: "password123",    // รหัสผ่านกลางสำหรับเทสระบบ
        name: `ภญ.${firstNames[index % firstNames.length]} ${baseLastName}`,
        role: "Chief_Pharmacist",
        hospital_ref: hospital._id  // ผูก ID วัตถุ MongoDB แท้ๆ เข้ากับโรงพยาบาลนั้น
      });

      // บัญชีที่ 2: พยาบาล (Nurse) -> มีสิทธิ์ ขอยืมยา / เซ็นรับยา
      mockUsers.push({
        user_id: `USR-${hospital.hospital_id}-NURSE`,
        username: `nurse_${rawId}`, // เช่น nurse_h10664
        password: "password123",
        name: `พว.${firstNames[(index + 5) % firstNames.length]} ${baseLastName}`,
        role: "Nurse",
        hospital_ref: hospital._id
      });
    });

    // 5. บันทึกข้อมูล Users ทั้งหมด 30 แถวลงฐานข้อมูลพร้อมกัน
    const createdUsers = await User.insertMany(mockUsers);
    console.log(`👥 Seeded ${createdUsers.length} users successfully into network!`);
    
    // พิมพ์ตัวอย่างบัญชีสำหรับนำไปใช้ Demo เป็นน้ำจิ้ม
    console.log("\n🔑 --- ตัวอย่างบัญชีสำหรับใช้เข้าสู่ระบบ (รหัสผ่านคือ password123 ทั้งหมด) ---");
    console.log(`🏢 โรงพยาบาล: ${hospitals[0].hospital_name}`);
    console.log(`   - สิทธิ์เภสัชกร (Approve ได้): pharm_${hospitals[0].hospital_id.toLowerCase()}`);
    console.log(`   - สิทธิ์พยาบาล (ยืม/รับได้): nurse_${hospitals[0].hospital_id.toLowerCase()}`);
    console.log(`🏢 โรงพยาบาล: ${hospitals[1].hospital_name}`);
    console.log(`   - สิทธิ์เภสัชกร (Approve ได้): pharm_${hospitals[1].hospital_id.toLowerCase()}`);
    console.log(`   - สิทธิ์พยาบาล (ยืม/รับได้): nurse_${hospitals[1].hospital_id.toLowerCase()}`);
    console.log("----------------------------------------------------------------------\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding users failed:", error);
    process.exit(1);
  }
};

seedUsers();