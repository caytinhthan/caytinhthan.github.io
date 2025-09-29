# Cây Tinh Thần

Một ứng dụng web nhỏ để tạo cây tương tác với những chiếc lá chứa thông điệp.

## Tính năng

- **Tự động thêm lá**: Click nút để thêm lá ở vị trí ngẫu nhiên
- **Đặt lá thủ công**: Click trực tiếp lên cây để chọn vị trí chính xác
- **Tùy chỉnh lá**: 8 hình dạng khác nhau và 6 bảng màu để lựa chọn
- **Kéo thả**: Di chuyển lá sau khi đã tạo
- **Lưu tự động**: Dữ liệu được lưu trong LocalStorage (demo), Firebase realtime database (deployed)

## Cách sử dụng

1. Chọn "Tự động thêm" để thêm lá ở vị trí ngẫu nhiên
2. Hoặc chọn "Click để đặt" rồi click vào cây để chọn vị trí
3. Chọn hình dạng, màu sắc và nhập thông điệp trong modal
4. Kéo thả các lá để di chuyển nếu cần
5. Hover để xem thông điệp, click để chỉnh sửa

## Công nghệ

- HTML5 với SVG cho đồ họa cây
- CSS3 cho animations và styling
- Vanilla JavaScript (không dùng framework)
- LocalStorage để lưu dữ liệu

## Chạy dự án

Mở file `index.html` trực tiếp trong trình duyệt, hoặc chạy local server:

```bash
python -m http.server 8080
```

## Ghi chú

