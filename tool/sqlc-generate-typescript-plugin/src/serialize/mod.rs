use std::fmt::Write;
use std::sync::LazyLock;

use regex_lite::Regex;

mod column;
mod error;
mod parameter;

use column::{IntegerMode, RowMode, column};
pub use error::{ParseNameError, SerializeError};
use parameter::{ParameterMode, parameter};

use crate::sqlc::plugin::Query;

static NAME_FORMAT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?<action>[A-Z][a-z]+).*$").unwrap());

fn lowercase_first_letter(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_lowercase().chain(c).collect(),
    }
}

const RESULT_TYPE_SUFFIX: [&str; 4] = [
    "RecordRowModeObjectIntegerModeNumber",
    "RecordRowModeObjectIntegerModeBigInt",
    "RecordRowModeTupleIntegerModeNumber",
    "RecordRowModeTupleIntegerModeBigInt",
];
const RESULT_TYPE_SUFFIX_LEN: usize = RESULT_TYPE_SUFFIX.len();

const TYPE_SUFFIX: [&str; 6] = [
    "ParametersNamed",
    "ParametersAnonymous",
    "RecordRowModeObjectIntegerModeNumber",
    "RecordRowModeObjectIntegerModeBigInt",
    "RecordRowModeTupleIntegerModeNumber",
    "RecordRowModeTupleIntegerModeBigInt",
];
const TYPE_SUFFIX_LEN: usize = TYPE_SUFFIX.len();

#[derive(PartialEq)]
enum Command {
    One,
    Many,
    Exec,
}

impl Command {
    fn from_tag(tag: &str) -> Option<Self> {
        match tag {
            ":one" => Some(Self::One),
            ":many" => Some(Self::Many),
            ":exec" => Some(Self::Exec),
            _ => None,
        }
    }

    fn to_literal(&self) -> String {
        (match self {
            Self::One => "\"one\"",
            Self::Many => "\"many\"",
            Self::Exec => "\"none\"",
        })
        .to_string()
    }
}

enum Action {
    Get,
    Insert,
    Update,
    Upsert,
    Delete,
}

enum ConnectionMode {
    Read,
    Write,
}

impl From<&Action> for ConnectionMode {
    fn from(val: &Action) -> Self {
        match val {
            Action::Get => Self::Read,
            Action::Insert | Action::Update | Action::Upsert | Action::Delete => Self::Write,
        }
    }
}

impl ConnectionMode {
    fn to_literal(&self) -> String {
        (match self {
            Self::Read => "\"r\"",
            Self::Write => "\"w\"",
        })
        .to_string()
    }
}

struct Name {
    name: String,
    value_name: String,
    action: Action,
}

impl Name {
    fn parse(name: &str) -> Result<Self, ParseNameError> {
        let Some(captures) = NAME_FORMAT.captures(name) else {
            return Err(ParseNameError::Malformed(name.to_string()));
        };

        let action_str = &captures["action"];

        let action = match action_str {
            "Get" => Some(Action::Get),
            "Insert" => Some(Action::Insert),
            "Update" => Some(Action::Update),
            "Upsert" => Some(Action::Upsert),
            "Delete" => Some(Action::Delete),
            _ => None,
        };

        let Some(action) = action else {
            return Err(ParseNameError::UnexpectedActionPrefix {
                name: name.to_string(),
                prefix: action_str.to_string(),
            });
        };

        Ok(Self {
            name: name.to_string(),
            value_name: lowercase_first_letter(name),
            action,
        })
    }
}

pub fn serialize(query: Query) -> Result<String, SerializeError> {
    let identifier = Name::parse(&query.name)?;
    let Some(command) = Command::from_tag(&query.cmd) else {
        return Err(SerializeError::UnexpectedCommand(query.cmd));
    };

    let mut buf = String::new();

    if !query.params.is_empty() {
        // ParametersNamed bound
        writeln!(buf, "type {}ParametersNamed = {{", identifier.name)?;
        for parameter in query.params.iter() {
            self::parameter(&mut buf, parameter, ParameterMode::Named)
                .map_err(|e| e.contextualize(&query))?;
        }
        writeln!(buf, "}};")?;

        // ParametersAnonymous bound
        writeln!(buf, "type {}ParametersAnonymous = [", identifier.name)?;
        for parameter in query.params.iter() {
            self::parameter(&mut buf, parameter, ParameterMode::Anonymous)
                .map_err(|e| e.contextualize(&query))?;
        }
        writeln!(buf, "];")?;
    } else {
        writeln!(
            buf,
            "type {}ParametersNamed = Record<string, never>;",
            identifier.name
        )?;

        writeln!(buf, "type {}ParametersAnonymous = [];", identifier.name)?;
    }

    if !query.columns.is_empty() && (command == Command::One || command == Command::Many) {
        writeln!(
            buf,
            "type {}RecordRowModeObjectIntegerModeNumber = {{",
            identifier.name
        )?;
        for column in query.columns.iter() {
            self::column(&mut buf, column, RowMode::Object, IntegerMode::Integer)?;
        }
        writeln!(buf, "}};")?;
        writeln!(
            buf,
            "type {}RecordRowModeObjectIntegerModeBigInt = {{",
            identifier.name
        )?;
        for column in query.columns.iter() {
            self::column(&mut buf, column, RowMode::Object, IntegerMode::BigInt)?;
        }
        writeln!(buf, "}};")?;
        writeln!(
            buf,
            "type {}RecordRowModeTupleIntegerModeNumber = [",
            identifier.name
        )?;
        for column in query.columns.iter() {
            self::column(&mut buf, column, RowMode::Tuple, IntegerMode::Integer)?;
        }
        writeln!(buf, "];")?;
        writeln!(
            buf,
            "type {}RecordRowModeTupleIntegerModeBigInt = [",
            identifier.name
        )?;
        for column in query.columns.iter() {
            self::column(&mut buf, column, RowMode::Tuple, IntegerMode::BigInt)?;
        }
        writeln!(buf, "];")?;
    } else {
        writeln!(
            buf,
            "type {}RecordRowModeObjectIntegerModeNumber = never;",
            identifier.name
        )?;
        writeln!(
            buf,
            "type {}RecordRowModeObjectIntegerModeBigInt = never;",
            identifier.name
        )?;
        writeln!(
            buf,
            "type {}RecordRowModeTupleIntegerModeNumber = never;",
            identifier.name
        )?;
        writeln!(
            buf,
            "type {}RecordRowModeTupleIntegerModeBigInt = never;",
            identifier.name
        )?;
    }

    writeln!(buf)?;

    writeln!(buf, "export const {}: Query<", identifier.value_name)?;
    writeln!(buf, "\t{},", command.to_literal())?;
    writeln!(
        buf,
        "\t{},",
        ConnectionMode::from(&identifier.action).to_literal()
    )?;
    for (idx, suffix) in TYPE_SUFFIX.iter().enumerate() {
        writeln!(
            buf,
            "\t{}{}{}",
            identifier.name,
            suffix,
            if idx < TYPE_SUFFIX_LEN - 1 { "," } else { "" }
        )?;
    }

    writeln!(buf, "> = {{")?;
    writeln!(buf, "\tname: \"{}\",", identifier.name)?;
    writeln!(
        buf,
        "\tquery: `-- name: {} {}\n{}`,",
        identifier.name, query.cmd, query.text
    )?;
    writeln!(buf, "\tbind: {{")?;

    let connection_mode = ConnectionMode::from(&identifier.action);
    {
        writeln!(buf, "\t\tnamed: (")?;
        writeln!(
            buf,
            "\t\t\tparameters: {}ParametersNamed, configuration?: {{ rowMode?: \"object\" | \"tuple\", integerMode?: \"number\" | \"bigint\" }}",
            identifier.name
        )?;
        writeln!(buf, "\t\t):")?;
        for (idx, suffix) in RESULT_TYPE_SUFFIX.iter().enumerate() {
            write!(
                buf,
                "\t\t\t| BoundQuery<{}, {}, {}{}>{}",
                command.to_literal(),
                connection_mode.to_literal(),
                identifier.name,
                suffix,
                if idx < RESULT_TYPE_SUFFIX_LEN - 1 {
                    "\n"
                } else {
                    ""
                }
            )?;
        }
        writeln!(buf, " => {{")?;
        writeln!(buf, "\t\t\treturn {{")?;
        writeln!(buf, "\t\t\t\tname: {}.name,", identifier.value_name)?;
        writeln!(buf, "\t\t\t\tquery: {}.query,", identifier.value_name)?;
        writeln!(buf, "\t\t\t\tparameters: [")?;
        for parameter in query.params.iter() {
            let Some(name) = parameter.column.as_ref().map(|c| c.name.clone()) else {
                return Err(SerializeError::ParameterNameUnknown {
                    index: parameter.number as usize,
                    query: identifier.name.clone(),
                });
            };

            writeln!(buf, "\t\t\t\t\tparameters[\"{}\"],", name)?;
        }
        writeln!(buf, "\t\t\t\t],")?;
        writeln!(
            buf,
            "\t\t\t\trowMode: configuration?.rowMode ?? \"object\","
        )?;
        writeln!(
            buf,
            "\t\t\t\tintegerMode: configuration?.integerMode ?? \"number\","
        )?;
        writeln!(buf, "\t\t\t\tresultMode: {},", command.to_literal())?;
        writeln!(
            buf,
            "\t\t\t\tconnectionMode: {},",
            connection_mode.to_literal()
        )?;
        writeln!(buf, "\t\t\t}};")?;
        writeln!(buf, "\t\t}},")?;
    }

    {
        writeln!(buf, "\t\tanonymous: (")?;
        writeln!(
            buf,
            "\t\t\tparameters: {}ParametersAnonymous, configuration?: {{ rowMode?: \"object\" | \"tuple\", integerMode?: \"number\" | \"bigint\" }}",
            identifier.name
        )?;
        writeln!(buf, "\t\t):")?;
        for (idx, suffix) in RESULT_TYPE_SUFFIX.iter().enumerate() {
            write!(
                buf,
                "\t\t\t| BoundQuery<{}, {}, {}{}>{}",
                command.to_literal(),
                connection_mode.to_literal(),
                identifier.name,
                suffix,
                if idx < RESULT_TYPE_SUFFIX_LEN - 1 {
                    "\n"
                } else {
                    ""
                }
            )?;
        }
        writeln!(buf, " => {{")?;
        writeln!(buf, "\t\t\treturn {{")?;
        writeln!(buf, "\t\t\t\tname: {}.name,", identifier.value_name)?;
        writeln!(buf, "\t\t\t\tquery: {}.query,", identifier.value_name)?;
        writeln!(buf, "\t\t\t\tparameters,")?;
        writeln!(
            buf,
            "\t\t\t\trowMode: configuration?.rowMode ?? \"object\","
        )?;
        writeln!(
            buf,
            "\t\t\t\tintegerMode: configuration?.integerMode ?? \"number\","
        )?;
        writeln!(buf, "\t\t\t\tresultMode: {},", command.to_literal())?;
        writeln!(
            buf,
            "\t\t\t\tconnectionMode: {},",
            connection_mode.to_literal()
        )?;
        writeln!(buf, "\t\t\t}};")?;
        writeln!(buf, "\t\t}},")?;
    }

    writeln!(buf, "\t}}")?;
    writeln!(buf, "}} as const;")?;

    Ok(buf)
}
