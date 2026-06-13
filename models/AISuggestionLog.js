const mongoose = require('mongoose');

const AISuggestionLogSchema = new mongoose.Schema({
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
    module_type: { 
        type: String, 
        enum: ['DYNAMIC_REBALANCING', 'PROACTIVE_MATCH'], 
        required: true 
    },
    confidence_score: { 
        type: Number, 
        required: true, 
        min: 0.0, 
        max: 1.0 
    },
    reasoning_summary: { 
        type: String, 
        required: true 
    },
    
    status: { 
        type: String, 
        enum: ['PENDING', 'ACCEPTED', 'IGNORED'], 
        default: 'PENDING' 
    },
    ignored_reason: { 
        type: String, 
        default: '' 
    },
    responded_by: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    }
}, { timestamps: true });

module.exports = mongoose.model('AISuggestionLog', AISuggestionLogSchema);