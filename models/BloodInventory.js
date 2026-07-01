const mongoose = require('mongoose');

const BloodInventorySchema = new mongoose.Schema({
    hospital_ref: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    blood_group: {
        type: String, 
        required: true,
        enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
    },
    component_type: {
        type: String,
        required: true,
        enum: ['PRC', 'FFP', 'PLT'], // PRC=เม็ดเลือดแดง, FFP=พลาสมา, PLT=เกล็ดเลือด
        default: 'PRC'
    },
    available_units: {
        type: Number,
        required: true,
        default: 0
    },
    safety_unit_level: {
        type: Number,
        required: true,
        default: 5 // เกณฑ์ขั้นต่ำที่ต้องมีติดตู้เลือด
    },
    lots: [{
        bag_number: String,      // เลขรหัสถุงเลือด
        expiry_date: Date,       // วันหมดอายุ (เลือดหมดอายุไวมาก)
        quantity_in_bag: Number  // จำนวนยูนิตในล็อตนั้น (ปกติ 1 ถุง = 1 ยูนิต)
    }]
}, { timestamps: true });

module.exports = mongoose.model('BloodInventory', BloodInventorySchema);