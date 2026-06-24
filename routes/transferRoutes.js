// ในไฟล์ routes/transferRoutes.js
const express = require('express');
const router = express.Router();
const { 
    createTransferRequest, 
    approveTransferRequest, 
    rejectTransferRequest,
    getIncomingTransfers
} = require('../controllers/transferController');

const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/inbox', protect, getIncomingTransfers);
router.post('/', protect, createTransferRequest);
router.patch('/:id/approve', protect, authorize('Chief_Pharmacist'), approveTransferRequest);
router.patch('/:id/reject', protect, authorize('Chief_Pharmacist'), rejectTransferRequest);

module.exports = router;