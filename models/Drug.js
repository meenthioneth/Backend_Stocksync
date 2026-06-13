const mongoose = require('mongoose');

const DrugSchema = new mongoose.Schema({
    drug_id: { 
        type: String, 
        required: true, 
        unique: true 
    }, // รหัส TMT Standard
    generic_name: { 
        type: String, 
        required: true, 
        index: true 
    },
    trade_name: { 
        type: String, 
        required: true 
    },
    category: { 
        type: String, 
        enum: ['High-Alert Emergency', 'General', 'Controlled'], 
        required: true 
    }
}, { timestamps: true });

module.exports = mongoose.model('Drug', DrugSchema);