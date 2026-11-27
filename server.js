const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '1234'; // รหัสผ่านอาจารย์ (ตั้งค่าใน .env หรือ Render ได้)

// กำหนดโฟลเดอร์และไฟล์สำหรับเก็บข้อมูล JSON
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');

// สร้างโฟลเดอร์ data และไฟล์ attendance.json อัตโนมัติถ้ายังไม่มี
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
}

// ฟังก์ชันช่วยอ่านและเขียนไฟล์ JSON
function readRecords() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function writeRecords(records) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

// ฟังก์ชันดึงวันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD)
function getThaiDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function getThaiTimeString() {
  return new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });
}

app.use(express.json({ limit: '10mb' })); // รองรับรูปถ่ายขนาดใหญ่
app.use(express.static(path.join(__dirname, 'public')));

// 1. API สำหรับนักศึกษาบันทึกการเช็คชื่อ
app.post('/api/checkin', (req, res) => {
  const { studentId, fullName, className, photo, latitude, longitude } = req.body;

  if (!studentId || !fullName || !photo) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลและถ่ายรูปให้ครบถ้วน' });
  }

  const records = readRecords();
  const newRecord = {
    id: Date.now().toString(),
    studentId: studentId.trim(),
    fullName: fullName.trim(),
    className: (className || '').trim(),
    date: getThaiDateString(), // เก็บเป็น YYYY-MM-DD เพื่อใช้กรองปฏิทิน
    time: getThaiTimeString(),
    photo,
    latitude: latitude || null,
    longitude: longitude || null,
    status: 'มาเรียน'
  };

  records.unshift(newRecord); // เพิ่มรายการล่าสุดไว้ด้านบน
  writeRecords(records);

  res.json({ success: true, message: 'เช็คชื่อสำเร็จ', record: newRecord });
});

// 2. API สำหรับผู้ปกครองค้นหาประวัติย้อนหลัง (กรองตามรหัสนักศึกษา และ/หรือ วันที่บนปฏิทิน)
app.get('/api/parent/history', (req, res) => {
  const { studentId, date } = req.query;

  if (!studentId) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสนักศึกษา' });
  }

  let records = readRecords().filter(r => r.studentId === studentId.trim());

  if (date) {
    records = records.filter(r => r.date === date);
  }

  res.json({ success: true, records });
});

// 3. API สำหรับอาจารย์ตรวจสอบข้อมูลย้อนหลังตามวันที่และรหัสผ่าน
app.post('/api/teacher/records', (req, res) => {
  const { password, date, studentId } = req.body;

  if (password !== TEACHER_PASSWORD) {
    return res.status(401).json({ success: false, message: 'รหัสผ่านอาจารย์ไม่ถูกต้อง' });
  }

  let records = readRecords();

  if (date) {
    records = records.filter(r => r.date === date);
  }
  if (studentId) {
    records = records.filter(r => r.studentId.includes(studentId.trim()));
  }

  res.json({ success: true, records });
});

// 4. API สำหรับอาจารย์ลบรายการเช็คชื่อ (เผื่อกรณีเช็คผิด)
app.delete('/api/teacher/records/:id', (req, res) => {
  const { password } = req.body;
  if (password !== TEACHER_PASSWORD) {
    return res.status(401).json({ success: false, message: 'ไม่มีสิทธิ์ลบข้อมูล' });
  }

  const records = readRecords().filter(r => r.id !== req.params.id);
  writeRecords(records);
  res.json({ success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});