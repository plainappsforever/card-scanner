// vCard referee (SPEC §13 O1, acceptance A7): macOS's own Contacts framework parses a .vcf file and prints what it
// understood as JSON — an independent judge of our writer (Apple's parser, not ours). Read-only: it parses bytes with
// CNContactVCardSerialization and never touches the user's address book (no Contacts permission needed).
// Usage: swift referee/swift/vcard-referee.swift <file.vcf>   (stdout: JSON array, one object per contact)
import Contacts
import Foundation

func label(_ l: String?) -> String {
  guard let l = l else { return "" }
  return CNLabeledValue<NSString>.localizedString(forLabel: l) == l ? l : l
}

let args = CommandLine.arguments
guard args.count == 2, let data = FileManager.default.contents(atPath: args[1]) else {
  FileHandle.standardError.write("usage: vcard-referee.swift <file.vcf>\n".data(using: .utf8)!)
  exit(2)
}

do {
  let contacts = try CNContactVCardSerialization.contacts(with: data)
  var out: [[String: Any]] = []
  for c in contacts {
    var o: [String: Any] = [
      "namePrefix": c.namePrefix, "givenName": c.givenName, "middleName": c.middleName, "familyName": c.familyName,
      "nameSuffix": c.nameSuffix, "organizationName": c.organizationName, "departmentName": c.departmentName,
      "jobTitle": c.jobTitle,
    ]
    o["phones"] = c.phoneNumbers.map { ["label": label($0.label), "value": $0.value.stringValue] }
    o["emails"] = c.emailAddresses.map { ["label": label($0.label), "value": $0.value as String] }
    o["urls"] = c.urlAddresses.map { ["label": label($0.label), "value": $0.value as String] }
    o["addresses"] = c.postalAddresses.map {
      ["label": label($0.label), "street": $0.value.street, "city": $0.value.city, "state": $0.value.state,
       "postalCode": $0.value.postalCode, "country": $0.value.country]
    }
    o["socials"] = c.socialProfiles.map {
      ["label": label($0.label), "service": $0.value.service, "url": $0.value.urlString, "username": $0.value.username]
    }
    if c.isKeyAvailable(CNContactNoteKey) { o["note"] = c.note }
    out.append(o)
  }
  let json = try JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted, .sortedKeys])
  FileHandle.standardOutput.write(json)
} catch {
  FileHandle.standardError.write("parse error: \(error)\n".data(using: .utf8)!)
  exit(1)
}
