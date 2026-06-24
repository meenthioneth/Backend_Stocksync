const jwt = require('jsonwebtoken');

// 1. ตรวจสอบว่าเข้าสู่ระบบหรือยัง (Protect Route)
const protect = async (req, res, next) => {
    let token;

    // เช็คว่ามี Token แนบมาใน Header หรือไม่ (Bearer Token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // ตัดคำว่า "Bearer " ออกเพื่อเอาแต่ตัว Token ดั้งเดิม
            token = req.headers.authorization.split(' ')[1];

            // 🛠️ จุดแก้ที่ 1: ใส่ข้อความลับสำรอง (||) ดักไว้ เผื่อระบบโหลดไฟล์ .env ไม่ขึ้นตอนเทส
            const secretKey = process.env.NEXTAUTH_SECRET || "supersecretkeysync1234";

            // ถอดรหัส Token 
            const decoded = jwt.verify(token, secretKey);

            // แนบข้อมูลผู้ใช้งานที่ถอดรหัสได้เข้ากับ req เพื่อให้ Controller นำไปใช้ต่อได้
            req.user = decoded; 
            next();
        } catch (error) {
            console.error('❌ Token Verification Failed:', error.message);
            
            // 🛠️ จุดแก้ที่ 2: ระบุสาเหตุให้ชัดเจนขึ้น พ่น error.message ออกไปหน้าบ้านด้วย 
            // เวลาเกิด "jwt malformed" จะได้รู้ทันทีที่หน้าจอ Postman โดยไม่ต้องสลับมาดูที่ Terminal หลังบ้าน
            return res.status(401).json({ 
                success: false, 
                message: `ไม่มีสิทธิ์เข้าถึงระบบ โทเค็นไม่ถูกต้อง (${error.message})` 
            });
        }
    }

    // กรณีที่ไม่ได้ส่งข้อมูลขึ้นมาใน req.headers.authorization เลย
    if (!token) {
        return res.status(401).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบ เนื่องจากไม่มีการส่งโทเค็นมา' });
    }
};

// 2. ตรวจสอบบทบาทสิทธิ์ (Role Authorization)
const authorize = (...roles) => {
    return (req, res, next) => {
        // เช็คเผื่อกรณีที่ req.user ไม่มีค่า (ป้องกันแอปค้าง/พังจากข้ามขั้นตอน)
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, message: 'ไม่พบข้อมูลสิทธิ์ของผู้ใช้งานในระบบ' });
        }

        // เช็คว่าบทบาทของผู้ใช้ ตรงกับลิสต์ที่อนุญาตไว้ไหม
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `สิทธิ์ตำแหน่งของคุณ (${req.user.role}) ไม่ได้รับอนุญาตให้ทำรายการนี้` 
            });
        }
        next();
    };
};

module.exports = { protect, authorize };