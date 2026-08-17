workspace "device database" {
    !identifiers hierarchical

    model {
        u = person "user"
        ha = person "home assistant" {
            tags "Robot"
        }

        ss = softwareSystem "device database" {
            frontend = container "frontend" {
                technology "lit"
                description "isomorphic, server-side rendered with progressive enhancements"
                tags "Website"
            }

            backend = container "backend" {
                technology "typescript / node.js"

                ssr = component "server side renderer"

                api = component "api" {
                    technology "http / rest-ish"
                }

                snapshot_service = component "snapshot service" {
                    description "manages snapshots"
                }

                staging = component "staging" {
                    technology "sqlite3"
                    description "holds submitted snapshots"
                    tags "Database"
                }

                index_service = component "index service" {
                    description "enables querying / full-text search of external data sources (live, third-party)"
                }

                index = component "index" {
                    technology "sqlite3"
                    description "stores indexed data"
                    tags "Database"
                }
            }

            object_store = container "object store" {
                technology "s3"
                description "holds snapshots that could not be processed in time"
                tags "Database"
            }
        }

        ssgh = softwareSystem "github" {
            live = container "live" {
                tags "Repository"
            }

            zigbee2mqtt = container "zigbee2mqtt" {
                tags "Repository"
            }

            zigbee_device_repository = container "zigbee device repository" {
                tags "Repository"
            }
        }

        sss = softwareSystem "slack" {
        }


        u -> ss.backend.ssr "visits" "https"
        ha -> ss.backend.api "submits snapshots\nqueries" "https"
        ss.frontend -> ss.backend.api "calls" "https"
        ss.backend.ssr -> ss.backend.api "delegates calls"
        ss.backend.ssr -> ss.frontend "renders / serves"
        ss.frontend -> ssgh.live "creates pull requests"
        ss.backend.api -> ss.backend.index_service "exposes / forwards change notifications"
        ss.backend.api -> ss.backend.snapshot_service "submits"
        ss.backend.snapshot_service -> ss.backend.staging "writes"
        ss.backend.snapshot_service -> ss.object_store "initial destination for snapshots\nperiodically ingested"
        ss.backend.snapshot_service -> ssgh.live "creates pull requests"
        ss.backend.index_service -> ss.backend.index "manages"
        ss.backend.index_service -> ssgh "fetches repository data"
        ssgh.live -> ss.backend.api "change notification webhooks"
        ss.backend.snapshot_service -> sss "posts interactive messages\nprocesses interactions"


        production = deploymentEnvironment "Production" {
           aws = deploymentNode "Amazon Web Services" {
                cf = infrastructureNode "CloudFront"

                eu_north_1 = deploymentNode "eu-north-1" {
                    elb = infrastructureNode "ELB"
                    ecs = deploymentNode "ECS" {
                        instances "1..N"
                        description "uses EFS for shared storage"
                        task = containerInstance ss.backend
                    }
                }
            }

            aws.cf -> aws.eu_north_1.elb "Forwards requests to" "HTTPS"
            aws.eu_north_1.elb -> aws.eu_north_1.ecs.task "Forwards requests to" "HTTPS"
        }
    }

    views {
        container ss "Container" {
            include *
        }

        component ss.backend "Component" {
            include *
        }

        deployment * production {
            include *
        }

        styles {
            element "Element" {
                strokeWidth 7
                shape roundedbox
            }
            element "Person" {
                shape person
            }
            element "Robot" {
                shape robot
            }
            element "Database" {
                shape cylinder
            }
            element "Repository" {
                shape folder
            }
            element "Website" {
                shape "WebBrowser"
            }
            element "Boundary" {
                strokeWidth 5
            }
            relationship "Relationship" {
                thickness 4
            }
        }
    }

    configuration {
        scope softwaresystem
    }
}
