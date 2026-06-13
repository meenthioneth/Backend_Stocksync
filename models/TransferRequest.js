const mongoose = require('mongoose');

const TransferRequestSchema = new mongoose.Schema({
    from_hospital: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Hospital', required: true 
    }, // ผู้ให้ยืม
    to_hospital: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Hospital', required: true 
    },   // ผู้ขอยืม
    drug_ref: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Drug', required: true 
    },
    
    created_by: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    approved_by: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    }, // เป็น null จนกว่าจะอนุมัติ
    
    quantity_requested: { 
        type: Number, 
        required: true, 
        min: 1 
    },
    quantity_approved: { 
        type: Number, 
        default: 0 
    }, // รองรับกรณี Partial Fulfillment
    
    status: { 
        type: String, 
        enum: ['PENDING', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED'], 
        default: 'PENDING',
        index: true
    },
    
    return_due_date: { 
        type: Date, 
        required: true 
    },
    return_status: { 
        type: String, 
        enum: ['PENDING', 'RETURNED'], 
        default: 'PENDING' 
    },
    rejection_reason: { 
        type: String, 
        default: '' 
    }
}, { timestamps: true });

module.exports = mongoose.model('TransferRequest', TransferRequestSchema);