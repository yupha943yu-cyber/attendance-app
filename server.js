const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' })); // รองรับการส่งภาพถ่ายขนาดใหญ่ Base64
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ฐานข้อมูลจำลองในหน่วยความจำ (สามารถเปลี่ยนเป็นฐานข้อมูลจริง เช่น Supabase ได้ภายหลัง)
let attendanceRecords = [];

// API สำหรับบันทึกการเช็คชื่อของนักเรียน
app.post('/api/attendance', (req, res) => {
    const { studentName, studentId, latitude, longitude, photo } = req.body;
    
    if (!studentName || !studentId) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อและรหัสนักศึกษาให้ครบถ้วน' });
    }

    const newRecord = {
        id: Date.now(),
        studentName,
        studentId,
        latitude: latitude || 'ไม่ระบุพิกัด',
        longitude: longitude || 'ไม่ระบุพิกัด',
        photo: photo || null,
        timestamp: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    };

    attendanceRecords.unshift(newRecord); // นำรายการใหม่ไว้บนสุด
    res.json({ success: true, message: 'เช็คชื่อสำเร็จเรียบร้อย', record: newRecord });
});

// API สำหรับดึงข้อมูลการเช็คชื่อทั้งหมด (สำหรับอาจารย์)
app.get('/api/attendance', (req, res) => {
    res.json(attendanceRecords);
});

// API สำหรับล้างข้อมูลประวัติการเช็คชื่อ
app.delete('/api/attendance', (req, res) => {
    attendanceRecords = [];
    res.json({ success: true, message: 'ล้างข้อมูลประวัติทั้งหมดเรียบร้อย' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 