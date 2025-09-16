use std::fmt;
use std::fmt::Write;

use thiserror::Error;

use super::error::SerializeError;

use crate::sqlc::plugin::{Column, Parameter, Query};

#[derive(Error, Debug)]
pub enum ParameterSerializeError {
    #[error("formatting error")]
    Fmt(#[from] fmt::Error),
    #[error("unknown name")]
    UnknownName { index: usize },
}

impl ParameterSerializeError {
    pub fn contextualize(&self, query: &Query) -> SerializeError {
        match self {
            Self::UnknownName { index } => SerializeError::ParameterNameUnknown {
                index: *index,
                query: query.name.clone(),
            },
            Self::Fmt(inner) => SerializeError::Fmt(*inner),
        }
    }
}

pub enum ParameterMode {
    Named,
    Anonymous,
}

fn input_type(column: &Column) -> Option<String> {
    let name = column.r#type.as_ref().map(|t| t.name.clone())?;

    let inferred = (match name.as_str() {
        "int" | "integer" | "tinyint" | "smallint" | "mediumint" | "bigint" | "unsignedbigint"
        | "int2" | "int8" => Some("number | bigint".to_string()),
        "real" | "double" | "doubleprecisionfloat" | "float" => Some("number".to_string()),
        "blob" => Some("NodeJS.ArrayBufferView".to_string()),
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

pub fn parameter(
    buf: &mut dyn Write,
    parameter: &Parameter,
    mode: ParameterMode,
) -> Result<(), ParameterSerializeError> {
    let name = if let Some(column) = &parameter.column {
        column.name.clone()
    } else {
        return Err(ParameterSerializeError::UnknownName {
            index: parameter.number as usize,
        });
    };

    match mode {
        ParameterMode::Named => {
            if let Some(comment) = parameter.column.as_ref().map(|c| c.comment.clone())
                && !comment.trim().is_empty()
            {
                writeln!(buf, "\t/** {} */", comment.clone())?;
            }

            writeln!(
                buf,
                "\t\"{}\": {};",
                name,
                parameter
                    .column
                    .as_ref()
                    .and_then(input_type)
                    .unwrap_or("any".to_string())
            )?;
        }
        ParameterMode::Anonymous => {
            writeln!(
                buf,
                "\t{}: {},",
                name,
                parameter
                    .column
                    .as_ref()
                    .and_then(input_type)
                    .unwrap_or("any".to_string())
            )?;
        }
    };

    Ok(())
}
