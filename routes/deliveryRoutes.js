const express = require('express');
const router = express.Router();
const { getDeliveries, updateDeliveryStatus, receiveDelivery } = require('../controllers/deliveryController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getDeliveries);
router.patch('/:id/status', protect, updateDeliveryStatus);
router.patch('/:id/receive', protect, receiveDelivery);

module.exports = router;
