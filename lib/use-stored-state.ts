"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * Giữ state qua lần tải lại bằng localStorage.
 * Chỉ dùng cho dữ liệu cấu hình; không lưu khoá API thật ở đây.
 *
 * Thứ tự quan trọng: đọc xong bản trong máy rồi mới ghi, để lần tải đầu
 * không ghi đè dữ liệu đã lưu bằng dữ liệu mặc định.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const initialRef = useRef(initial);
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: T | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw) as T;
    } catch {
      // Bỏ qua dữ liệu hỏng và dùng dữ liệu mẫu.
    }
    setValue(stored ?? initialRef.current);
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Trình duyệt có thể chặn localStorage; giao diện vẫn chạy bình thường.
    }
  }, [key, ready, value]);

  return [value, setValue, ready];
}
