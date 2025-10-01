# Cây Thông Điệp

Ứng dụng web để tạo cây tương tác với các lá chứa thông điệp.

## Tính năng

- **Tự động thêm lá**: Thêm lá ở vị trí ngẫu nhiên
- **Click để đặt**: Click trực tiếp lên cây để chọn vị trí 
- **Kéo thả**: Di chuyển lá sau khi tạo
- **Tùy chỉnh lá**: 12 hình dạng và 6 chủ đề màu sắc (tiền bạc, tình yêu, học tập, công việc, mối quan hệ, khác)
- **Chế độ chỉ xem**: Khóa chỉnh sửa, chỉ cho phép xem thông điệp
- **Theme sáng/tối**: Chuyển đổi giao diện
- **Responsive**: Hoạt động trên mobile và desktop

## Cách sử dụng

1. Nhấn "Tự động thêm" để thêm lá ngẫu nhiên
2. Hoặc bật "Click để đặt" và click vào cây
3. Chọn hình dạng, chủ đề màu sắc và nhập thông điệp
4. Click vào lá để xem thông điệp, có thể sửa nếu cần
5. Bật "Kéo thả" để di chuyển lá

## Công nghệ

- HTML5, CSS3, JavaScript
- SVG cho đồ họa cây
- Firebase Realtime Database (production)
- LocalStorage (fallback)

## Chạy dự án

Mở `index.html` trong trình duyệt hoặc:

```bash
python -m http.server 8080
```

Hoặc, dự án đã được deploy, truy cập trang web: caytinhthan.github.io

## Lưu trữ

- **Production**: Firebase Realtime Database (realtime sync)
- **Local/fallback**: LocalStorage
- Dữ liệu tự động sync giữa các tab/device khi có Firebase