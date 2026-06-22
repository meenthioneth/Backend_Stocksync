const express = require('express');
const router = express.Router();
const { getAlertQueue } = require('../controllers/aiController');

// URL สำหรับเรียกใช้งาน: GET /api/ai/alert-queue
router.get('/alert-queue', getAlertQueue);

module.exports = router;