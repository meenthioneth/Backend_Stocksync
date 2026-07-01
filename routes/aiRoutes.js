const express = require('express');
const router = express.Router();
const { getAlertQueue, getExpiryRedistribution, getMapAnalytics, searchEmergencyDrug, 
        getBloodExpiryRedistribution, getBloodAlertQueue, getBloodMapAnalytics, searchEmergencyBlood } = require('../controllers/aiController');

// 🌟 จุดที่ต้องเพิ่ม: ดึง Middleware ล็อกอินมาใช้งาน (เปลี่ยน Path ตามโฟลเดอร์จริงของคุณ)
const { protect } = require('../middleware/authMiddleware'); 

// URL สำหรับเรียกใช้งาน: GET /api/ai/alert-queue
router.get('/alert-queue', getAlertQueue);
router.get('/expiry-redistribution', getExpiryRedistribution);
router.get('/map-analytics', getMapAnalytics);

// คราวนี้จะใช้งานตัวแปร protect ได้อย่างถูกต้องแล้วครับ
router.post('/search-emergency', protect, searchEmergencyDrug);

router.get('/blood/expiry-redistribution', getBloodExpiryRedistribution);
router.get('/blood/alert-queue', getBloodAlertQueue);
router.get('/blood/map-analytics', getBloodMapAnalytics);
router.post('/blood/search-emergency', protect, searchEmergencyBlood);

module.exports = router;