const express = require('express');
const router = express.Router();
const { getHospitalInventory} = require('../controllers/hospitalController');
const { protect } = require('../middleware/authMiddleware');

// บังคับว่าต้อง Login ก่อนเท่านั้นถึงจะดูข้อมูลได้
router.get('/:hospital_id/inventory', protect , getHospitalInventory);

module.exports = router;