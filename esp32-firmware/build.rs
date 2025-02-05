extern crate cc;

fn main() {
    // println!("cargo::rerun-if-changed=ffi/ctest.c");

    println!("cargo::rustc-link-lib=static=ctest");
    println!("cargo::rustc-link-search=.");

    println!("cargo::rustc-link-arg-bins=-Tlinkall.x");

    // let mut build = cc::Build::new();

    // build.file("ffi/ctest.c").flag("-mlongcalls").compile("ctest");
}
