const User = require('../models/User');
const jwt = require('jsonwebtoken');

// @desc    เข้าสู่ระบบและสร้าง Token ส่งให้หน้าบ้าน
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. ตรวจสอบว่ากรอกข้อมูลครบไหม
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        // 2. ค้นหาผู้ใช้งานในคอลเลกชัน USER (พร้อมตรวจสอบว่ามีโรงพยาบาลสังกัดไหม)
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        // 3. ตรวจสอบรหัสผ่าน (ในระบบ MVP จริงสามารถเปลี่ยนเป็น bcrypt.compare ได้)
        if (user.password !== password) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        // 4. สร้าง JWT Token โดยยัดข้อมูลสิทธิ์และโรงพยาบาลเข้าไป
        const token = jwt.sign(
            { 
                _id: user._id, 
                username: user.username,
                role: user.role, // Chief_Pharmacist หรือ Nurse
                hospital_id: user.hospital_ref, // ID โรงพยาบาลสังกัด
                health_zone: 8
            },
            process.env.NEXTAUTH_SECRET, // ใช้คีย์ร่วมกับ NextAuth ฝั่งหน้าบ้าน
            { expiresIn: '30d' } // อายุตั๋ว 30 วัน
        );

        // 5. ส่งข้อมูลกลับไปให้ Next.js (หน้าบ้าน) นำไปเก็บไว้ใน Session
        return res.status(200).json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            token,
            user: {
                id: user._id,
                name: user.name,
                role: user.role,
                hospital_id: user.hospital_ref
            }
        });

    } catch (error) {
        console.error('❌ Login Error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    ออกจากระบบ / ล้าง Token
// @route   POST /api/auth/logout
const logoutUser = async (req, res) => {
    try {
        // 1. สั่งล้าง Cookie ที่ชื่อ 'token' (ถ้าฝั่ง Next.js มีการใช้ Cookie เก็บเอาไว้)
        res.cookie('token', 'none', {
            expires: new Date(Date.now() + 10 * 1000), // ให้หมดอายุภายใน 10 วินาที
            httpOnly: true
        });

        // 2. ส่ง Response กลับไปบอกหน้าบ้านว่าเคลียร์สำเร็จแล้วนะ
        return res.status(200).json({ 
            success: true, 
            message: 'ออกจากระบบสำเร็จเรียบร้อยแล้ว' 
        });
    } catch (error) {
        console.error('❌ Logout error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = { loginUser, logoutUser };