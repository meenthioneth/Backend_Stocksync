const express = require('express');
const router = express.Router();
const { searchDrugs } = require('../controllers/drugController');

// GET /api/drugs/search?q=...  — ไม่ต้อง login (ใช้ในช่องค้นหายาฉุกเฉินบน Topbar)
router.get('/search', searchDrugs);

module.exports = router;
