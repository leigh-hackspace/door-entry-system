extern crate cc;

fn main() {
    println!("cargo::rustc-link-arg-bins=-Tlinkall.x");
}
