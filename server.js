const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db.js');
require('dotenv').config();

// บังคับให้เซิร์ฟเวอร์รู้จักโมเดลทั้งหมดตั้งแต่เปิดเครื่อง
require('./models/Hospital');
require('./models/Drug');
require('./models/Inventory');
require('./models/TransferRequest');
require('./models/Delivery');

const app = express();

// เชื่อมต่อ MongoDB Atlas
connectDB();

// Middlewares
app.use(cors());
app.use(express.json()); // อ่าน JSON body จาก Next.js

// Base Route
app.get('/', (req, res) => {
    res.send('StockSync API v2 (14-Day MVP) is running...');
});

// Registering API Routes (เปิดท่อส่งข้อมูลทั้งหมด)
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/drugs', require('./routes/drugRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/transfers', require('./routes/transferRoutes')); 
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/hospitals', require('./routes/hospitalRoutes')); // GET /api/hospitals/:id
app.use('/api/delivery', require('./routes/deliveryRoutes'));

// Error Handling Middleware พื้นฐาน (เผื่อมีอะไรพังในระบบ)
app.use((err, req, res, next) => {
    console.error('💥 Server Error:', err.stack);
    res.status(500).json({ success: false, message: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 StockSync Backend started on port ${PORT}`));