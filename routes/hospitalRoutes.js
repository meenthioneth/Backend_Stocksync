const express = require('express');
const router = express.Router();
const { getHospitalInventory, getHospitalBloodInventory} = require('../controllers/hospitalController');
const { protect } = require('../middleware/authMiddleware');

// บังคับว่าต้อง Login ก่อนเท่านั้นถึงจะดูข้อมูลได้
router.get('/:hospital_id/inventory', protect , getHospitalInventory);
router.get('/:hospital_id/blood-inventory', protect, getHospitalBloodInventory);

module.exports = router;