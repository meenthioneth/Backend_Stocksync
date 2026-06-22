// ในไฟล์ routes/transferRoutes.js
const express = require('express');
const router = express.Router();
const { 
    createTransferRequest, 
    approveTransferRequest, 
    rejectTransferRequest 
} = require('../controllers/transferController');

router.post('/', createTransferRequest);              // POST /api/transfers
router.patch('/:id/approve', approveTransferRequest); // PATCH /api/transfers/:id/approve
router.patch('/:id/reject', rejectTransferRequest);   // PATCH /api/transfers/:id/reject

module.exports = router;