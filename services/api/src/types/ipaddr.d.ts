declare module "ipaddr.js" {
  namespace ipaddr {
    interface IPAddress {
      kind(): "ipv4" | "ipv6";
      range(): string;
      toString(): string;
    }
    function parse(input: string): IPAddress;
  }
  export = ipaddr;
}
