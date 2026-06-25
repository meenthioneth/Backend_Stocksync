const express = require('express');
const router = express.Router();
const { getAlertQueue, getExpiryRedistribution, getMapAnalytics } = require('../controllers/aiController');

// URL สำหรับเรียกใช้งาน: GET /api/ai/alert-queue
router.get('/alert-queue', getAlertQueue);
router.get('/expiry-redistribution', getExpiryRedistribution);
router.get('/map-analytics', getMapAnalytics);

module.exports = router;