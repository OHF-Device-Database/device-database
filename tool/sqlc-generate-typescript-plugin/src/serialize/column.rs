use std::fmt;
use std::fmt::Write;

use crate::sqlc::plugin::Column;

pub enum RowMode {
    Object,
    Tuple,
}

pub enum IntegerMode {
    Integer,
    BigInt,
}

impl IntegerMode {
    pub fn is_bigint(&self) -> bool {
        match self {
            IntegerMode::Integer => false,
            IntegerMode::BigInt => true,
        }
    }
}

fn output_type(column: &Column, read_bigint: bool) -> Option<String> {
    let name = column.r#type.as_ref().map(|t| t.name.clone())?;

    let inferred = (match name.as_str() {
        "int" | "integer" | "tinyint" | "smallint" | "mediumint" | "bigint" | "unsignedbigint"
        | "int2" | "int8"
            if !read_bigint =>
        {
            Some("number".to_string())
        }
        "int" | "integer" | "tinyint" | "smallint" | "mediumint" | "bigint" | "unsignedbigint"
        | "int2" | "int8"
            if read_bigint =>
        {
            Some("bigint".to_string())
        }
        "real" | "double" | "doubleprecisionfloat" | "float" => Some("number".to_string()),
        "blob" => Some("Uint8Array".to_string()),
        "bool" | "boolean" => Some("boolean".to_string()),
        "text" | "varchar" => Some("string".to_string()),
        _ => None,
    })?;

    if column.not_null {
        Some(inferred)
    } else {
        Some(format!("{} | null", inferred))
    }
}

pub fn column(
    buf: &mut dyn Write,
    column: &Column,
    row_mode: RowMode,
    integer_mode: IntegerMode,
) -> Result<(), fmt::Error> {
    match row_mode {
        RowMode::Object => {
            if !column.comment.trim().is_empty() {
                writeln!(buf, "\t/** {} */", column.comment.clone())?;
            }

            writeln!(
                buf,
                "\t\"{}\": {};",
                column.name,
                output_type(column, integer_mode.is_bigint()).unwrap_or("unknown".to_string())
            )?;
        }
        RowMode::Tuple => {
            writeln!(
                buf,
                "\t{}: {},",
                column.name,
                output_type(column, integer_mode.is_bigint()).unwrap_or("unknown".to_string())
            )?;
        }
    }

    Ok(())
}
