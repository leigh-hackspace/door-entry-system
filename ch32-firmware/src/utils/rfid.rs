use ch32_hal::{gpio::Output, mode::Blocking, peripherals::SPI1, spi::Spi};
use embedded_hal::spi::{Operation, SpiDevice};

pub fn get_number(uid_bytes: &[u8]) -> u128 {
    match uid_bytes.len() {
        4 => u32::from_le_bytes(uid_bytes[..4].try_into().unwrap_or([0, 0, 0, 0])) as u128,
        7 => {
            let mut bytes = [0; 8];
            bytes[..7].copy_from_slice(&uid_bytes[..7]);
            u64::from_le_bytes(bytes) as u128
        }
        10 => {
            let mut bytes = [0; 16];
            bytes[..10].copy_from_slice(&uid_bytes[..10]);
            u128::from_le_bytes(bytes)
        }
        _ => {
            // log::error!("Wrong bytes count!");
            unreachable!() // I don't think that this case is reachable
        }
    }
}

pub struct MySpiDevice<'a> {
    pub spi: Spi<'a, SPI1, Blocking>,
    pub cs: Output<'a>,
}

impl<'a> SpiDevice for MySpiDevice<'a> {
    fn transaction(&mut self, operations: &mut [embedded_hal::spi::Operation<'_, u8>]) -> Result<(), Self::Error> {
        self.cs.set_low();

        let op_res = operations.iter_mut().try_for_each(|op| match op {
            Operation::Read(buf) => self.spi.blocking_read(buf),
            Operation::Write(buf) => self.spi.blocking_write(buf),
            Operation::Transfer(read, write) => self.spi.blocking_transfer(read, write),
            Operation::TransferInPlace(buf) => self.spi.blocking_transfer_in_place(buf),
            Operation::DelayNs(_) => Ok(()),
        });

        self.cs.set_high();

        let op_res = op_res.map_err(|_err| MySpiError::Operation)?;

        Ok(op_res)
    }
}

impl<'a> embedded_hal::spi::ErrorType for MySpiDevice<'a> {
    type Error = MySpiError;
}

impl embedded_hal::spi::Error for MySpiError {
    fn kind(&self) -> embedded_hal::spi::ErrorKind {
        todo!()
    }
}

#[derive(Debug)]
pub enum MySpiError {
    Operation,
}
