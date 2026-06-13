const mongoose = require('mongoose');

// โครงสร้างย่อยของรุ่นการผลิต (Sub-document ของ DRUG_LOT)
const DrugLotSchema = new mongoose.Schema({
    lot_number: { 
      type: String, 
      required: true 
    },
    expiry_date: { 
      type: Date, 
      required: true 
    },
    quantity_in_lot: { 
      type: Number, 
      required: true, 
      min: 0 
    }
});

const InventorySchema = new mongoose.Schema({
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
    
    // สถานะเชิงปริมาณ (หัวใจหลักของระบบตัดสต็อกฉุกเฉิน)
    quantity: { 
      type: Number, 
      required: true, 
      default: 0 
    },
    available_quantity: { 
      type: Number, 
      required: true, 
      default: 0 
    },
    reserved_quantity: { 
      type: Number, 
      required: true, 
      default: 0 
    },
    safety_stock_level: { 
      type: Number, 
      required: true, 
      default: 0 
    },
    
    // ข้อมูลจำเพาะหน้างานคลัง
    ward_location: { 
      type: String, 
      required: true 
    }, // เช่น "ER Crash Cart ชั้น 1"
    storage_condition: { 
      type: String, 
      enum: ['Cold Chain 2-8°C', 'Room Temp'], 
      required: true 
    },
    
    // ฝังล็อตยา (Entity 4) ลงไปตรงๆ เป็น Array
    lots: [DrugLotSchema]
}, { timestamps: true });

// ป้องกันข้อมูลคลังซ้ำซ้อน: 1 โรงพยาบาล จะมีข้อมูลยา 1 รายการได้เพียงเซตเดียวเท่านั้น
InventorySchema.index({ hospital_ref: 1, drug_ref: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', InventorySchema);