const mongoose = require('mongoose');

const HospitalSchema = new mongoose.Schema({
    hospital_id: { 
        type: String, 
        required: true, 
        unique: true 
    }, // รหัส สธ.
    hospital_name: { 
        type: String, 
        required: true 
    },
    hospital_type: { 
        type: String, 
        enum: ['A', 'B', 'M', 'F1', 'F2', 'F3'], 
        required: true 
    },
    location: {
        type: { 
            type: String, 
            default: 'Point' 
        },
        coordinates: { 
            type: [Number], 
            required: true 
        } // [longitude, latitude] สำคัญ: ต้องเอา long ขึ้นก่อนตามหลัก GeoJSON ของ Mongo
    },
    health_zone: { 
        type: Number, 
        required: true 
    },
    network_group_id: { 
        type: String, 
        required: true 
    }
}, { timestamps: true });

// ทำ Index พิกัดเพื่อให้ระบบค้นหา รพ. ใกล้เคียงได้ในระดับมิลลิวินาที
HospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', HospitalSchema);