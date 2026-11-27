const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '67219100051';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

function ensureDb(res) {
  if (!supabase) {
    res.status(500).json({
      success: false,
      message: 'ยังไม่ได้ตั้งค่า SUPABASE_URL หรือ SUPABASE_KEY ใน Environment Variables'
    });
    return false;
  }
  return true;
}

function getThaiDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

function getThaiTimeString() {
  return new Date().toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatRecord(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    fullName: row.full_name,
    className: row.class_name || '',
    date: row.date,
    time: row.time,
    photo: row.photo,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status || 'มาเรียน'
  };
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ตรวจสอบสถานะระบบ
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    databaseConnected: Boolean(supabase),
    serverDate: getThaiDateString()
  });
});

// 1. นักศึกษาบันทึกการเช็คชื่อ (บังคับใช้วันที่ปัจจุบันจากเซิร์ฟเวอร์)
app.post('/api/checkin', async (req, res) => {
  if (!ensureDb(res)) return;

  const { studentId, fullName, className, photo, latitude, longitude } = req.body || {};

  if (!studentId || !String(studentId).trim() || !fullName || !String(fullName).trim()) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุลให้ครบถ้วน' });
  }
  if (!photo || typeof photo !== 'string') {
    return res.status(400).json({ success: false, message: 'กรุณาถ่ายภาพยืนยันตัวตนก่อนบันทึก' });
  }

  const newRow = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    student_id: String(studentId).trim(),
    full_name: String(fullName).trim(),
    class_name: className ? String(className).trim() : '',
    date: getThaiDateString(),
    time: getThaiTimeString(),
    photo,
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    status: 'มาเรียน'
  };

  const { data, error } = await supabase
    .from('attendance_records')
    .insert([newRow])
    .select()
    .single();

  if (error) {
    console.error('Check-in insert error:', error);
    return res.status(500).json({ success: false, message: 'บันทึกข้อมูลลงฐานข้อมูลไม่สำเร็จ' });
  }

  return res.json({
    success: true,
    message: 'เช็คชื่อสำเร็จ',
    record: formatRecord(data)
  });
});

// 2. ผู้ปกครองค้นหาประวัติย้อนหลัง (กรองตามรหัสนักศึกษา และวันที่จากปฏิทินถ้ามี)
app.get('/api/parent/history', async (req, res) => {
  if (!ensureDb(res)) return;

  const studentId = req.query.studentId ? String(req.query.studentId).trim() : '';
  const date = req.query.date ? String(req.query.date).trim() : '';

  if (!studentId) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสนักศึกษา' });
  }

  let query = supabase
    .from('attendance_records')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (date) {
    query = query.eq('date', date);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Parent history query error:', error);
    return res.status(500).json({ success: false, message: 'ดึงข้อมูลประวัติไม่สำเร็จ' });
  }

  return res.json({
    success: true,
    records: (data || []).map(formatRecord)
  });
});

// 3. อาจารย์ตรวจสอบข้อมูลย้อนหลังตามรหัสผ่าน + ปฏิทิน + รหัสนักศึกษา
app.post('/api/teacher/records', async (req, res) => {
  if (!ensureDb(res)) return;

  const { password, date, studentId } = req.body || {};

  if (password !== TEACHER_PASSWORD) {
    return res.status(401).json({ success: false, message: 'รหัสผ่านอาจารย์ไม่ถูกต้อง' });
  }

  let query = supabase
    .from('attendance_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (date && String(date).trim()) {
    query = query.eq('date', String(date).trim());
  }
  if (studentId && String(studentId).trim()) {
    query = query.ilike('student_id', `%${String(studentId).trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Teacher records query error:', error);
    return res.status(500).json({ success: false, message: 'ดึงข้อมูลการเช็คชื่อไม่สำเร็จ' });
  }

  return res.json({
    success: true,
    records: (data || []).map(formatRecord)
  });
});

// 4. อาจารย์ลบรายการเช็คชื่อ
app.delete('/api/teacher/records/:id', async (req, res) => {
  if (!ensureDb(res)) return;

  const { password } = req.body || {};
  if (password !== TEACHER_PASSWORD) {
    return res.status(401).json({ success: false, message: 'ไม่มีสิทธิ์ลบข้อมูล' });
  }

  const { error } = await supabase
    .from('attendance_records')
    .delete()
    .eq('id', req.params.id);

  if (error) {
    console.error('Delete record error:', error);
    return res.status(500).json({ success: false, message: 'ลบข้อมูลไม่สำเร็จ' });
  }

  return res.json({ success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' });
});

app.listen(PORT, () => {
  console.log(`WorkCheck server running on port ${PORT}`);
});