# Cây Tình Thần

Ứng dụng web tương tác với cây và lá để viết thông điệp.

## Tác giả

**Trịnh Hoàng Tú**
- Cybersec Undergraduate
- Focus: Frontend Development & UX Design

## Tính năng

- **Thêm lá**: Click vào cây để đặt lá tại vị trí bất kỳ
- **Thông điệp**: Viết và lưu thông điệp trên từng lá
- **Đăng nhập**: Firebase Authentication với Google OAuth
- **Phân quyền**: User thường và Admin
- **Realtime**: Đồng bộ dữ liệu trực tiếp
- **Theme**: Chế độ sáng/tối
- **Mobile**: Responsive design

## Đăng nhập

- **Email/Password**: Đăng ký và đăng nhập thông thường
- **Google**: OAuth với Google account
- **Phân quyền**: User (xem profile) / Admin (quản trị)

## Công nghệ

- Vanilla JavaScript ES6
- Firebase v12.3.0 (Auth + Realtime Database)
- SVG graphics
- CSS custom properties

## Deploy

Live site: https://caytinhthan.github.io

## Facebook + Firebase OAuth

If you use Facebook Login with this project see `FIREBASE_FACEBOOK_SETUP.md` for exact Redirect URIs and local dev server instructions.

## File structure

```
├── index.html          # Main app
├── login.html          # Login page  
├── register.html       # Register page
├── profile.html        # User profile
├── admin.html          # Admin panel
├── src/
│   ├── firebase-init.js # Firebase config
│   ├── auth.js         # Authentication
│   ├── auth-guard.js   # Access control
│   └── script.js       # Main logic
└── assets/            # CSS files
```

## Features

- 🌳 Interactive tree with clickable leaves
- 📝 Personal messages on each leaf
- 🔐 Secure authentication system
- 👥 Multi-user with role management
- 📱 Mobile-first responsive design
- 🌙 Dark/Light theme toggle
- ⚡ Real-time data synchronization