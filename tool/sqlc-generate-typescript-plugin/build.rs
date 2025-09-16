fn main() {
    prost_build::compile_protos(&["src/vendor/sqlc/protos/plugin/codegen.proto"], &["src"])
        .unwrap();
}
