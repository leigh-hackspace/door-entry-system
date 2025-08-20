use ch32_hal::{peripherals, usart::UartTx};

// Parse hex color string like "FF7700" to u32 (24-bit RGB)
pub fn parse_hex_color_u32(hex_str: &str) -> Result<u32, ()> {
    if hex_str.len() != 6 {
        return Err(());
    }

    let r = parse_hex_byte(&hex_str[0..2])? as u32;
    let g = parse_hex_byte(&hex_str[2..4])? as u32;
    let b = parse_hex_byte(&hex_str[4..6])? as u32;

    // Pack RGB into u32: 0x00RRGGBB
    Ok((r << 16) | (g << 8) | b)
}

// Parse a 2-character hex string to u8
pub fn parse_hex_byte(hex_str: &str) -> Result<u8, ()> {
    if hex_str.len() != 2 {
        return Err(());
    }

    let high = hex_char_to_u8(hex_str.bytes().nth(0).ok_or(())?)?;
    let low = hex_char_to_u8(hex_str.bytes().nth(1).ok_or(())?)?;

    Ok((high << 4) | low)
}

// Convert single hex character to u8 value
pub fn hex_char_to_u8(c: u8) -> Result<u8, ()> {
    match c {
        b'0'..=b'9' => Ok(c - b'0'),
        b'A'..=b'F' => Ok(c - b'A' + 10),
        b'a'..=b'f' => Ok(c - b'a' + 10),
        _ => Err(()),
    }
}

// Parse boolean from "0"/"1" strings
pub fn parse_bool(s: &str) -> Result<bool, ()> {
    match s {
        "0" => Ok(false),
        "1" => Ok(true),
        _ => Err(()),
    }
}

/// Sends a single ASCII digit to the UART
pub fn print_digit(tx: &mut UartTx<'_, peripherals::USART1, ch32_hal::mode::Blocking>, digit: u8) {
    let _ = tx.blocking_write(&[digit + 48]);
}

/// Write an integer (u128) to UART without leading zeros
pub fn print_unsigned(tx: &mut UartTx<'_, peripherals::USART1, ch32_hal::mode::Blocking>, mut n: u128) {
    let mut buf = [0u8; 40]; // max digits in u128
    let mut i = 0;

    if n == 0 {
        let _ = tx.blocking_write(b"0");
        return;
    }

    while n > 0 {
        buf[i] = (n % 10) as u8;
        n /= 10;
        i += 1;
    }

    while i > 0 {
        i -= 1;
        print_digit(tx, buf[i]);
    }
}
