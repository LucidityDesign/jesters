import SwiftUI

/// A simple card face: rank and suit symbol in the suit's color on a white card.
struct CardView: View {
    let card: Card
    var isDimmed = false
    var isSelected = false
    var size: CGFloat = 1

    var body: some View {
        VStack(spacing: 0) {
            Text(card.rankText)
                .font(.system(size: 20 * size, weight: .bold, design: .rounded))
            if let suit = card.suit {
                Text(suit.symbol)
                    .font(.system(size: 20 * size))
            }
        }
        .foregroundStyle(card.color)
        .frame(width: 50 * size, height: 72 * size)
        .background(.white, in: RoundedRectangle(cornerRadius: 8 * size))
        .overlay {
            RoundedRectangle(cornerRadius: 8 * size)
                .strokeBorder(isSelected ? Color.accentColor : Color.gray.opacity(0.5), lineWidth: isSelected ? 3 : 1)
        }
        .opacity(isDimmed ? 0.35 : 1)
        .offset(y: isSelected ? -14 : 0)
        .animation(.default, value: isSelected)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityName)
    }
}

#Preview {
    HStack {
        ForEach(["W1", "H14", "S10", "D2", "C12", "J1"], id: \.self) { code in
            CardView(card: Card(code: code)!)
        }
    }
    .padding()
    .background(.green.opacity(0.3))
}
