const mongoose = require('mongoose');

const DrugUsageRateSchema = new mongoose.Schema({
    hospital_ref: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Hospital', 
        required: true 
    },
    drug_ref: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Drug', 
        required: true 
    },
    
    // อัตราการใช้ยาเฉลี่ยต่อเดือน (ระบบประมวลผลหรือบันทึกย้อนหลัง 3-6 เดือน)
    average_monthly_usage: { 
        type: Number, 
        required: true, 
        default: 0,
        min: 0
    },
    
    // ยอดที่มีการคีย์จ่ายยาให้คนไข้ไปแล้วจริงๆ ในเดือนปัจจุบัน (Current Month Cycle)
    current_month_usage: { 
        type: Number, 
        required: true, 
        default: 0,
        min: 0
    },
    
    // ระดับอัตราความต้องการ (เผื่อนำไปฟิลเตอร์บนหน้า แดชบอร์ด: 'HIGH', 'MEDIUM', 'LOW')
    demand_intensity: {
        type: String,
        enum: ['HIGH', 'MEDIUM', 'LOW'],
        default: 'MEDIUM'
    }
}, { timestamps: true });

// ทำ Index ป้องกันข้อมูลซ้ำ: 1 โรงพยาบาล จะมีสถิติของยา 1 ตัวได้แค่แถวเดียวเท่านั้น
DrugUsageRateSchema.index({ hospital_ref: 1, drug_ref: 1 }, { unique: true });

module.exports = mongoose.model('DrugUsageRate', DrugUsageRateSchema);