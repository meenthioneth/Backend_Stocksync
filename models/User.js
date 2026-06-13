const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    user_id: { 
        type: String, 
        required: true, 
        unique: true 
    },
    hospital_ref: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Hospital', required: true 
    }, // ผูกกับสิทธิ์ รพ.
    name: { 
        type: String, 
        required: true 
    },
    username: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String,
        required: true 
    }, // เผื่อทำระบบแฮชรหัสผ่านในสัปดาห์แรก
    role: { 
        type: String, 
        enum: ['Chief_Pharmacist', 'Nurse', 'Admin'], 
        required: true 
    }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);