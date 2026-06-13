const mongoose = require('mongoose');

const DeliverySchema = new mongoose.Schema({
    request_ref: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'TransferRequest', 
        required: true, 
        unique: true 
    },
    ems_unit_name: { 
        type: String, 
        required: true 
    },
    
    // เก็บประวัติพิกัดรถขนส่งในลักษณะอาเรย์ของพิกัด [long, lat]
    route_details: {
        type: { 
            type: String, 
            default: 'LineString' 
        },
        coordinates: { 
            type: [[Number]], 
            default: [] 
        } 
    },
    
    estimated_arrival: { 
        type: Date 
    }, // ค่า ETA ประมวลผลจากภายนอก
    delivery_status: { 
        type: String, 
        enum: ['DISPATCHED', 'EN_ROUTE', 'DELIVERED', 'FAILED'], 
        default: 'DISPATCHED' 
    },
    
    received_by: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    },
    received_at: { 
        type: Date, 
        default: null 
    }
}, { timestamps: true });

module.exports = mongoose.model('Delivery', DeliverySchema);