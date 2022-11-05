import random
import sys

suits = ['♣','♥','♠','♦']
values = ['Ace','2','3','4','5','6','7','8','9','10','Jack','Queen','King']

print("\n Welcome to the game")

print("\n Objective: Finish the entire deck without finding the value of a card")

print("\n Deck is shuffled")

print("\n Chance of success is 1.5%. Good Luck!!")

def deck(suits,values):
    
    new_deck = []

    for i in range(len(suits)):
        for j in range(len(values)):
            new_deck.append(f'{values[j]} of {suits[i]}')
    random.shuffle(new_deck)
    return new_deck
  
def user_input():
        
    accept = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
    x = ''
        
    while x not in accept:
        x = input(" Make a valid guess (2-10,J,Q,K,A): ").upper() 
      
    return x   
    
def check():
    
    a = deck(suits,values)
    
    
    r = 0
   
    for item in a:
        
        while True:
            if user_input() in (a[r]):
                print(f'\n You lose, it was the {a[r]}')
                rep = input("\n Play again? Y/N").upper()
                if rep == "Y":
                    check()
                else:
                    sys.exit()
                
            else:
                
                if r != 51 :   
                    print(f"\n Guess doesn't match the card, cards remaining: {51-r}")
                    r += 1
                    
                else:
                    
                    print(f"\n Guess doesn't match the card, cards remaining: {51-r}")
                    print("\n Congratulations!!! You finished the entire deck!!!")
                    rep = input("\n Play again? Y/N ").upper()
                    
                    if rep == "Y":
                        check()
                    else:
                        sys.exit()
                    
check()      


    